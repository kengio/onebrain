/**
 * update — Update @onebrain-ai/cli to the latest version
 *
 * Steps:
 *   1. Get current binary version
 *   2. Fetch latest release from GitHub (parse tag_name)
 *   3. Install binary — skipped if already at latest version
 *   4. Validate binary (ATOMIC GATE)
 *
 * Runs from any directory — no vault.yml required.
 *
 * TTY:     uses cli-ui primitives
 * Non-TTY: plain text lines
 *
 * Exit code: 0 on success, 1 on failure.
 */

import pc from 'picocolors';
import { printBanner } from './internal/cli-banner.js';
import { barBlank, barLine, close, makeStepFn, writeLine } from './internal/cli-ui.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateOptions {
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
  currentVersionFn?: () => Promise<{ version: string; publishedAt: Date | null }>;
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

const GITHUB_REPO = 'https://api.github.com/repos/kengio/onebrain';
const GITHUB_RELEASES_URL = `${GITHUB_REPO}/releases/latest`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Step 1: Fetch latest release
// ---------------------------------------------------------------------------

interface ReleaseInfo {
  version: string;
  publishedAt: Date | null;
}

async function fetchLatestRelease(fetchFn: typeof fetch): Promise<ReleaseInfo> {
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
  const publishedAt =
    typeof json['published_at'] === 'string' ? new Date(json['published_at']) : null;
  return { version: tagName, publishedAt };
}

function formatReleaseDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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

async function defaultCurrentVersion(): Promise<{ version: string; publishedAt: Date | null }> {
  try {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows
      ? [windowsShell(), '-NoProfile', '-Command', 'onebrain --version']
      : ['onebrain', '--version'];
    const proc = Bun.spawn(cmd, { stdout: 'pipe', stderr: 'pipe' });
    const exitCode = await proc.exited;
    if (exitCode !== 0) return { version: 'unknown', publishedAt: null };
    const stdout = await new Response(proc.stdout).text();
    const versionMatch = /v[\d.]+/.exec(stdout);
    const dateMatch = /released (\d{4}-\d{2}-\d{2})/.exec(stdout);
    return {
      version: versionMatch ? versionMatch[0] : 'unknown',
      publishedAt: dateMatch ? new Date(dateMatch[1]!) : null,
    };
  } catch {
    return { version: 'unknown', publishedAt: null };
  }
}

// ---------------------------------------------------------------------------
// Main runUpdate
// ---------------------------------------------------------------------------

export async function runUpdate(opts: UpdateOptions = {}): Promise<UpdateResult> {
  const isTTY = opts.isTTY ?? process.stdout.isTTY ?? false;
  const check = opts.check ?? false;

  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const installBinaryFn = opts.installBinaryFn ?? defaultInstallBinary;
  const validateBinaryFn = opts.validateBinaryFn ?? defaultValidateBinary;
  const currentVersionFn = opts.currentVersionFn ?? defaultCurrentVersion;

  const result: UpdateResult = { ok: false, exitCode: 0 };
  const createStep = makeStepFn(isTTY);

  if (isTTY) {
    await printBanner();
  } else {
    writeLine('OneBrain Update');
  }

  // Step 1: Get current binary version
  const sp1 = createStep('🔍', 'Local version');
  const { version: currentVersion, publishedAt: localPublishedAt } = await currentVersionFn();
  result.currentVersion = currentVersion;
  const localVersionLabel = localPublishedAt
    ? `${pc.dim(currentVersion)}  ${pc.dim('·')}  ${pc.dim(formatReleaseDate(localPublishedAt))}`
    : pc.dim(currentVersion);
  if (sp1) sp1.stop(localVersionLabel);
  else writeLine(`current: ${currentVersion}`);

  // Step 2: Fetch latest release
  const sp2 = createStep('🌐', 'Remote version');
  let latestVersion: string;
  let publishedAt: Date | null = null;
  try {
    const release = await fetchLatestRelease(fetchFn);
    latestVersion = release.version;
    publishedAt = release.publishedAt;
    const dateSuffix = publishedAt
      ? `  ${pc.dim('·')}  ${pc.dim(formatReleaseDate(publishedAt))}`
      : '';
    if (sp2) sp2.stop(`${pc.green(latestVersion)}${dateSuffix}`);
    else writeLine(`latest: ${latestVersion}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (sp2) sp2.stop('unavailable');
    result.error = `Fetch failed: ${msg}`;
    result.exitCode = 1;
    if (isTTY) {
      close(result.error, true);
    } else {
      process.stderr.write(`update: ${result.error}\n`);
    }
    return result;
  }
  result.latestVersion = latestVersion;

  // --check dry run
  if (check) {
    if (isTTY) {
      if (currentVersion !== latestVersion) {
        barLine(
          `⬆️   ${pc.dim(currentVersion)}  →  ${pc.green(latestVersion)}  · binary would upgrade`,
        );
        barBlank();
      }
      close('Dry run complete — no changes made');
    } else {
      writeLine('done: dry run complete — no changes made');
    }
    result.ok = true;
    result.exitCode = 0;
    return result;
  }

  // Already up to date?
  if (latestVersion === currentVersion) {
    if (isTTY) {
      close(`Already up to date — @onebrain-ai/cli ${pc.dim(latestVersion)}`);
    } else {
      writeLine(`already up to date: @onebrain-ai/cli ${latestVersion}`);
      writeLine('done: nothing to do');
    }
    result.ok = true;
    result.exitCode = 0;
    return result;
  }

  // Show upgrade arrow
  if (isTTY) {
    barLine(`⬆️   ${pc.dim(currentVersion)}  →  ${pc.green(latestVersion)}`);
    barBlank();
  }

  // Step 3: Install binary
  const sp3 = createStep('📦', 'Installing @onebrain-ai/cli');
  try {
    await installBinaryFn(latestVersion);
    if (sp3) sp3.stop(pc.green(latestVersion));
    else writeLine(`upgrading: @onebrain-ai/cli ${latestVersion} installed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (sp3) sp3.stop('install failed');
    result.error = `Binary install failed: ${msg}`;
    result.exitCode = 1;
    if (isTTY) {
      close(result.error, true);
    } else {
      process.stderr.write(`update: ${result.error}\n`);
    }
    return result;
  }

  // Step 4: Validate binary (ATOMIC GATE)
  const sp4 = createStep('✅', 'Validating binary');
  const binaryValid = await validateBinaryFn();
  if (!binaryValid) {
    if (sp4) sp4.stop('failed');
    result.error = 'Binary validation failed. Check PATH.';
    result.exitCode = 1;
    if (isTTY) {
      close(result.error, true);
    } else {
      process.stderr.write(`update: ${result.error}\n`);
    }
    return result;
  }
  if (sp4) sp4.stop('ok');

  result.ok = true;
  result.exitCode = 0;

  if (isTTY) {
    close(`Done — run ${pc.cyan('/update')} in Claude to sync vault files`);
  } else {
    writeLine('done: run /update in Claude to sync vault files');
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI entry point (called from index.ts)
// ---------------------------------------------------------------------------

export interface UpdateCommandOptions {
  check?: boolean;
}

export async function updateCommand(opts: UpdateCommandOptions = {}): Promise<void> {
  const result = await runUpdate(opts);
  if (!result.ok) {
    process.exit(result.exitCode || 1);
  }
}
