/**
 * update — Atomic OneBrain update sequence
 *
 * Steps:
 *   0. Guard: vault.yml must exist (prevents running outside a vault)
 *   1. Fetch latest release from GitHub (parse tag_name)
 *   2. Sync plugin files (vault-sync)
 *   3. (Handled by vault-sync Step 4 — merge harness files)
 *   4. Install binary — skipped if already at latest version
 *   4b. Validate binary (ATOMIC GATE — register-hooks blocked if this fails)
 *   5. Register hooks (only if 4b passed)
 *   6. Write onebrain_version to vault.yml
 *
 * TTY:     uses @clack/prompts layout with spinners for slow steps
 * Non-TTY: plain text lines
 *
 * Exit code: 0 on success, 1 on failure.
 */

import { existsSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spinner as createSpinner, intro, log, outro } from '@clack/prompts';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateOptions {
  /** Vault root directory (default: process.cwd()). */
  vaultDir?: string;
  /** Whether stdout is a TTY (default: process.stdout.isTTY). */
  isTTY?: boolean;
  /** Dry run — show what would change and exit 0 without making changes. */
  check?: boolean;
  /** Override update channel: 'stable' | 'next'. Falls back to vault.yml update_channel. */
  channel?: 'stable' | 'next';
  /** Mock fetch for tests. */
  fetchFn?: typeof fetch;
  /** Injectable vault-sync function for tests. */
  vaultSyncFn?: (
    vaultDir: string,
    opts: Record<string, unknown>,
  ) => Promise<{ filesAdded: number; filesRemoved: number }>;
  /** Injectable binary install function for tests. */
  installBinaryFn?: (version: string) => Promise<void>;
  /** Injectable binary validation function for tests. Returns true if binary is valid. */
  validateBinaryFn?: () => Promise<boolean>;
  /** Injectable register-hooks function for tests. */
  registerHooksFn?: (vaultDir: string) => Promise<void>;
}

export interface UpdateResult {
  ok: boolean;
  exitCode: number;
  latestVersion?: string;
  currentVersion?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/kengio/onebrain/releases/latest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve branch name from channel or vault.yml update_channel. */
function resolveBranch(channel: string | undefined): string {
  return channel === 'next' ? 'next' : 'main';
}

/** Read vault.yml as raw object — non-throwing. Returns {} on missing/invalid. */
async function readVaultYmlRaw(vaultDir: string): Promise<Record<string, unknown>> {
  try {
    const text = await readFile(join(vaultDir, 'vault.yml'), 'utf8');
    return (parseYaml(text) ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Write onebrain_version field to vault.yml atomically (in-place merge). */
async function writeVersionToVaultYml(vaultDir: string, version: string): Promise<void> {
  const raw = await readVaultYmlRaw(vaultDir);
  raw.onebrain_version = version;
  const content = stringifyYaml(raw, { lineWidth: 0 });
  const vaultYmlPath = join(vaultDir, 'vault.yml');
  const tmpPath = `${vaultYmlPath}.tmp`;
  await writeFile(tmpPath, content, 'utf8');
  await rename(tmpPath, vaultYmlPath);
}

// ---------------------------------------------------------------------------
// Step 1: Fetch latest release
// ---------------------------------------------------------------------------

async function fetchLatestVersion(fetchFn: typeof fetch): Promise<string> {
  const response = await fetchFn(GITHUB_RELEASES_URL, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!response.ok) {
    throw new Error(`GitHub API returned HTTP ${response.status}`);
  }
  const json = (await response.json()) as Record<string, unknown>;
  const tagName = json.tag_name;
  if (typeof tagName !== 'string' || !tagName) {
    throw new Error('GitHub response missing tag_name');
  }
  return tagName;
}

// ---------------------------------------------------------------------------
// Step 4: Install binary
// ---------------------------------------------------------------------------

// On Windows, .cmd/.ps1 scripts require a shell wrapper. Prefer pwsh (PowerShell 7,
// available on ARM64/Server Core) with fallback to powershell.exe (Windows PowerShell 5.1).
// Memoized — detection runs once per process.
let _windowsShell: string | undefined;
function windowsShell(): string {
  if (_windowsShell !== undefined) return _windowsShell;
  try {
    const r = Bun.spawnSync(['pwsh', '--version'], { stdout: 'pipe', stderr: 'pipe' });
    _windowsShell = r.exitCode === 0 ? 'pwsh' : 'powershell.exe';
  } catch {
    _windowsShell = 'powershell.exe';
  }
  return _windowsShell;
}

async function defaultInstallBinary(version: string): Promise<void> {
  const isWindows = process.platform === 'win32';
  // Escape single quotes for PowerShell literal string; semver won't contain them but
  // keeps parity with the escaping applied in buildQmdSpawnArgs.
  const safeVersion = version.replace(/'/g, "''");
  const cmd = isWindows
    ? [windowsShell(), '-NoProfile', '-Command', `npm install -g '@onebrain-ai/cli@${safeVersion}'`]
    : ['bun', 'install', '-g', `@onebrain-ai/cli@${version}`];

  const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errText = await new Response(proc.stderr).text();
    throw new Error(`Binary install failed (exit ${exitCode}): ${errText.trim()}`);
  }
}

// ---------------------------------------------------------------------------
// Step 4b: Validate binary
// ---------------------------------------------------------------------------

async function defaultValidateBinary(): Promise<boolean> {
  try {
    // On Windows, onebrain is installed as onebrain.cmd — must invoke via shell
    const isWindows = process.platform === 'win32';
    const cmd = isWindows
      ? [windowsShell(), '-NoProfile', '-Command', 'onebrain --version']
      : ['onebrain', '--version'];
    const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return false;
    const stdout = await new Response(proc.stdout).text();
    return /^\d+\.\d+/.test(stdout.trim());
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main runUpdate
// ---------------------------------------------------------------------------

export async function runUpdate(opts: UpdateOptions = {}): Promise<UpdateResult> {
  const vaultDir = opts.vaultDir ?? process.cwd();
  const isTTY = opts.isTTY ?? process.stdout.isTTY ?? false;
  const check = opts.check ?? false;

  const fetchFn = opts.fetchFn ?? globalThis.fetch;

  const vaultSyncFn =
    opts.vaultSyncFn ??
    (async (dir: string, syncOpts: Record<string, unknown>) => {
      const { runVaultSync } = await import('../internal/vault-sync.js');
      const result = await runVaultSync(dir, syncOpts);
      return { filesAdded: result.filesAdded, filesRemoved: result.filesRemoved };
    });

  const installBinaryFn = opts.installBinaryFn ?? defaultInstallBinary;
  const validateBinaryFn = opts.validateBinaryFn ?? defaultValidateBinary;

  const registerHooksFn =
    opts.registerHooksFn ??
    (async (dir: string) => {
      const { runRegisterHooks } = await import('../internal/register-hooks.js');
      await runRegisterHooks({ vaultDir: dir });
    });

  const result: UpdateResult = {
    ok: false,
    exitCode: 0,
  };

  // Output helpers
  function writeLine(msg: string) {
    process.stdout.write(`${msg}\n`);
  }

  function noteStep(label: string, detail: string) {
    if (isTTY) {
      log.step(`${label}\n│  ${detail}`);
    } else {
      writeLine(`${label}: ${detail}`);
    }
  }

  // Header
  if (isTTY) {
    intro('OneBrain Update');
  } else {
    writeLine('OneBrain Update');
  }

  // ── Step 0: Guard — vault.yml must exist ─────────────────────────────────

  if (!existsSync(join(vaultDir, 'vault.yml'))) {
    const msg = `vault.yml not found in ${vaultDir}. Run 'onebrain update' from inside an OneBrain vault.`;
    if (isTTY) {
      log.error(msg);
    } else {
      writeLine(`error: ${msg}`);
    }
    result.error = msg;
    result.exitCode = 1;
    return result;
  }

  // ── Step 1: Fetch latest release ──────────────────────────────────────────

  let latestVersion: string;
  try {
    latestVersion = await fetchLatestVersion(fetchFn);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = `Fetch failed: ${msg}`;
    result.exitCode = 1;
    process.stderr.write(`update: ${result.error}\n`);
    return result;
  }

  result.latestVersion = latestVersion;

  // Read current version from vault.yml
  const vaultYmlRaw = await readVaultYmlRaw(vaultDir);
  const currentVersion =
    typeof vaultYmlRaw.onebrain_version === 'string' ? vaultYmlRaw.onebrain_version : 'unknown';
  result.currentVersion = currentVersion;

  // Resolve channel/branch
  const channel =
    opts.channel ??
    (typeof vaultYmlRaw.update_channel === 'string'
      ? (vaultYmlRaw.update_channel as 'stable' | 'next')
      : 'stable');
  const branch = resolveBranch(channel);

  noteStep('fetching', `${latestVersion} available (current: ${currentVersion})`);

  // ── --check: dry run ──────────────────────────────────────────────────────

  if (check) {
    if (isTTY) {
      outro('Dry run complete — no changes made');
    } else {
      writeLine('done: dry run complete — no changes made');
    }
    result.ok = true;
    result.exitCode = 0;
    return result;
  }

  // ── Step 2: vault-sync ────────────────────────────────────────────────────

  let filesAdded = 0;
  let filesRemoved = 0;
  const syncSpinner = isTTY ? createSpinner() : null;
  syncSpinner?.start('Syncing plugin files…');
  try {
    const syncResult = await vaultSyncFn(vaultDir, { branch });
    filesAdded = syncResult.filesAdded;
    filesRemoved = syncResult.filesRemoved;
    syncSpinner?.stop(`Synced — ${filesAdded} added, ${filesRemoved} removed`);
    if (!isTTY) {
      writeLine(`syncing: ${filesAdded} files synced, ${filesRemoved} removed`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    syncSpinner?.stop('Sync failed');
    result.error = `vault-sync failed: ${msg}`;
    result.exitCode = 1;
    process.stderr.write(`update: ${result.error}\n`);
    return result;
  }

  // ── Step 4: Install binary (skipped if already at latest version) ─────────

  const needsBinaryUpdate = latestVersion !== currentVersion;

  if (needsBinaryUpdate) {
    const installSpinner = isTTY ? createSpinner() : null;
    installSpinner?.start(`Installing @onebrain-ai/cli ${latestVersion}…`);
    try {
      await installBinaryFn(latestVersion);
      installSpinner?.stop(`Installed @onebrain-ai/cli ${latestVersion}`);
      if (!isTTY) {
        writeLine(`upgrading: @onebrain-ai/cli ${latestVersion} installed`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      installSpinner?.stop('Install failed');
      result.error = `Binary install failed: ${msg}`;
      result.exitCode = 1;
      process.stderr.write(`update: ${result.error}\n`);
      return result;
    }
  } else {
    noteStep('binary', `@onebrain-ai/cli ${latestVersion} already up to date`);
  }

  // ── Step 4b: Validate binary (ATOMIC GATE) ────────────────────────────────

  const binaryValid = await validateBinaryFn();
  if (!binaryValid) {
    result.error = 'Binary validation failed. Check PATH. register-hooks NOT called.';
    result.exitCode = 1;
    process.stderr.write(`update: ${result.error}\n`);
    return result;
  }

  // ── Step 5: Register hooks (only if 4b passed) ────────────────────────────

  let hooksDetail = 'hooks: ✓  PATH: ✓  permissions: ✓';
  let hooksOk = true;
  try {
    await registerHooksFn(vaultDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    hooksDetail = `warning: ${msg}`;
    hooksOk = false;
    process.stderr.write(`update: register-hooks warning: ${msg}\n`);
  }

  if (isTTY) {
    log.step(`Registering hooks\n│  ${hooksDetail}`);
  } else {
    writeLine(hooksOk ? 'hooks: ok  PATH: ok  permissions: ok' : `hooks: warning — ${hooksDetail}`);
  }

  // ── Step 6: Write version to vault.yml ───────────────────────────────────

  try {
    await writeVersionToVaultYml(vaultDir, latestVersion);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`update: vault.yml version write warning: ${msg}\n`);
    if (isTTY) {
      log.warn(`vault.yml not updated — ${msg}`);
    } else {
      writeLine(`warning: vault.yml not updated — ${msg}`);
    }
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  result.ok = true;
  result.exitCode = 0;

  const doneMsg = `OneBrain ${latestVersion}`;
  if (isTTY) {
    outro(`Done — ${doneMsg}`);
  } else {
    writeLine(`done: ${doneMsg}`);
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry point (called from index.ts)
// ---------------------------------------------------------------------------

export interface UpdateCommandOptions {
  vaultDir?: string;
  check?: boolean;
  channel?: 'stable' | 'next';
}

export async function updateCommand(opts: UpdateCommandOptions = {}): Promise<void> {
  const result = await runUpdate(opts);
  if (!result.ok) {
    process.exit(result.exitCode || 1);
  }
}
