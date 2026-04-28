/**
 * update — Update OneBrain CLI binary
 *
 * Steps:
 *   0. Guard: vault.yml must exist (prevents running outside a vault)
 *   1. Fetch latest release from GitHub (parse tag_name)
 *   2. Install binary — skipped if already at latest version
 *   3. Validate binary (ATOMIC GATE)
 *
 * Vault file sync (plugin files, INSTRUCTIONS.md, etc.) is handled by the
 * /update skill in Claude Code — not by this command.
 *
 * TTY:     uses @clack/prompts layout with spinners for slow steps
 * Non-TTY: plain text lines
 *
 * Exit code: 0 on success, 1 on failure.
 */

import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { cancel, spinner as createSpinner, outro } from '@clack/prompts';
import pc from 'picocolors';
import { printBanner, resolveBinaryVersion } from './internal/cli-banner.js';

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
  /** Mock fetch for tests. */
  fetchFn?: typeof fetch;
  /** Injectable binary install function for tests. */
  installBinaryFn?: (version: string) => Promise<void>;
  /** Injectable binary validation function for tests. Returns true if binary is valid. */
  validateBinaryFn?: () => Promise<boolean>;
  /** Injectable current version function for tests. */
  currentVersionFn?: () => Promise<string>;
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
  const tagName = json['tag_name'];
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
    return /v\d+\.\d+/.test(stdout.trim());
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Current version detection
// ---------------------------------------------------------------------------

async function defaultCurrentVersion(): Promise<string> {
  try {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows
      ? [windowsShell(), '-NoProfile', '-Command', 'onebrain --version']
      : ['onebrain', '--version'];
    const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return 'unknown';
    const stdout = await new Response(proc.stdout).text();
    const match = /v[\d.]+/.exec(stdout.trim());
    return match ? match[0] : 'unknown';
  } catch {
    return 'unknown';
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
  const installBinaryFn = opts.installBinaryFn ?? defaultInstallBinary;
  const validateBinaryFn = opts.validateBinaryFn ?? defaultValidateBinary;
  const currentVersionFn = opts.currentVersionFn ?? defaultCurrentVersion;

  const result: UpdateResult = { ok: false, exitCode: 0 };

  function writeLine(msg: string) {
    process.stdout.write(`${msg}\n`);
  }

  function step(msg: string) {
    process.stdout.write(`${pc.bold(pc.green('==>'))} ${msg}\n`);
  }

  if (isTTY) {
    const binaryVersion = resolveBinaryVersion();
    printBanner();
    process.stdout.write(
      `${pc.bold('OneBrain')} ${pc.dim('Update')}  ${pc.dim(`v${binaryVersion}`)}  ${pc.dim('—')}  ${pc.dim(vaultDir)}\n\n`,
    );
  } else {
    writeLine('OneBrain Update');
    writeLine('binary-only');
  }

  // Step 0: Guard
  try {
    await access(join(vaultDir, 'vault.yml'));
  } catch {
    const msg = `vault.yml not found in ${vaultDir}. Run 'onebrain update' from inside an OneBrain vault.`;
    if (isTTY) {
      cancel(msg);
    } else {
      writeLine(`error: ${msg}`);
    }
    result.error = msg;
    result.exitCode = 1;
    return result;
  }

  // Step 1: Fetch latest version
  let latestVersion: string;
  try {
    latestVersion = await fetchLatestVersion(fetchFn);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.error = `Fetch failed: ${msg}`;
    result.exitCode = 1;
    if (isTTY) {
      cancel(result.error);
    } else {
      process.stderr.write(`update: ${result.error}\n`);
    }
    return result;
  }
  result.latestVersion = latestVersion;

  const currentVersion = await currentVersionFn();
  result.currentVersion = currentVersion;

  // --check dry run
  if (check) {
    if (isTTY) {
      process.stdout.write('\n');
      process.stdout.write(`   Current  ${pc.dim(currentVersion)}\n`);
      process.stdout.write(`   Latest   ${pc.green(latestVersion)}\n`);
      if (currentVersion !== latestVersion) {
        process.stdout.write(`   ${pc.green('→ binary would upgrade')}\n`);
      }
      process.stdout.write('\n');
      outro('Dry run complete — no changes made');
    } else {
      writeLine(`current: ${currentVersion}`);
      writeLine(`latest: ${latestVersion}`);
      writeLine('done: dry run complete — no changes made');
    }
    result.ok = true;
    result.exitCode = 0;
    return result;
  }

  // Already up to date?
  if (latestVersion === currentVersion) {
    if (isTTY) {
      step(`Already up to date  @onebrain-ai/cli ${latestVersion}`);
      outro('Nothing to do');
    } else {
      writeLine(`already up to date: @onebrain-ai/cli ${latestVersion}`);
      writeLine('done: nothing to do');
    }
    result.ok = true;
    result.exitCode = 0;
    return result;
  }

  // Show upgrade
  if (isTTY) {
    step(`${pc.dim(currentVersion)}  →  ${pc.green(latestVersion)}`);
  }

  // Step 2: Install binary
  const installSpinner = isTTY ? createSpinner() : null;
  installSpinner?.start(`Installing @onebrain-ai/cli ${latestVersion}…`);
  try {
    await installBinaryFn(latestVersion);
    installSpinner?.stop(`Binary installed  ${latestVersion}`);
    if (!isTTY) writeLine(`upgrading: @onebrain-ai/cli ${latestVersion} installed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    installSpinner?.stop('Install failed');
    result.error = `Binary install failed: ${msg}`;
    result.exitCode = 1;
    if (isTTY) {
      cancel(result.error);
    } else {
      process.stderr.write(`update: ${result.error}\n`);
    }
    return result;
  }

  // Step 3: Validate binary
  const binaryValid = await validateBinaryFn();
  if (!binaryValid) {
    result.error = 'Binary validation failed. Check PATH.';
    result.exitCode = 1;
    if (isTTY) {
      cancel(result.error);
    } else {
      process.stderr.write(`update: ${result.error}\n`);
    }
    return result;
  }

  result.ok = true;
  result.exitCode = 0;

  if (isTTY) {
    outro('Done — run /update in Claude to sync vault files');
  } else {
    writeLine('done: run /update in Claude to sync vault files');
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry point (called from index.ts)
// ---------------------------------------------------------------------------

export interface UpdateCommandOptions {
  vaultDir?: string;
  check?: boolean;
}

export async function updateCommand(opts: UpdateCommandOptions = {}): Promise<void> {
  const result = await runUpdate(opts);
  if (!result.ok) {
    process.exit(result.exitCode || 1);
  }
}
