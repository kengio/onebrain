/**
 * session-init — internal command
 *
 * Outputs JSON to stdout with session token, datetime, and qmd_unembedded.
 * If vault.yml is missing or invalid, outputs a block decision JSON.
 *
 * Exit code is always 0 (never crashes Claude Code).
 */

import { unlink } from 'node:fs/promises';
import { tmpdir as osTmpdir } from 'node:os';
import { join } from 'node:path';
import { loadVaultConfig } from '../../lib/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionInitPayload = {
  datetime: string;
  session_token: string;
  qmd_unembedded: number;
};

export type SessionInitBlock = {
  decision: 'block';
  reason: 'onebrain-init-required';
};

export type SessionInitResult = SessionInitPayload | SessionInitBlock;

// ---------------------------------------------------------------------------
// formatDatetime
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Format a Date as "Ddd · DD Mon YYYY · HH:MM" (24h, zero-padded).
 * Example: "Thu · 23 Apr 2026 · 18:04"
 */
export function formatDatetime(date: Date): string {
  const dow = DAY_NAMES[date.getDay()];
  const day = String(date.getDate()).padStart(2, '0');
  const mon = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${dow} · ${day} ${mon} ${year} · ${hh}:${mm}`;
}

// ---------------------------------------------------------------------------
// resolveSessionToken
// ---------------------------------------------------------------------------

/**
 * Resolve session token using priority order:
 * 1. WT_SESSION env var (strip non-alphanumeric, first 8 chars)
 * 2. process.ppid if > 1
 * 3. PowerShell parent PID (Windows fallback — not tested on Mac)
 * 4. Day-scoped cache file: $tmpDir/onebrain-day-YYYYMMDD.token
 */
export async function resolveSessionToken(tmpDir: string = osTmpdir()): Promise<string> {
  // 1. WT_SESSION
  const wtSession = process.env['WT_SESSION'];
  if (wtSession) {
    const stripped = wtSession.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    if (stripped.length > 0) return stripped;
  }

  // 2. PPID
  const ppid = process.ppid;
  if (ppid !== undefined && ppid > 1) return String(ppid);

  // 3. PowerShell fallback (Windows only)
  try {
    const ps = Bun.spawn(
      [
        'powershell.exe',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(Get-Process -Id $PID).Parent.Id',
      ],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    const timeoutMs = 3000;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const race = await Promise.race([
      ps.exited,
      new Promise<'timeout'>((resolve) => {
        timerId = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
    if (timerId !== undefined) clearTimeout(timerId);
    if (race !== 'timeout') {
      const out = (await new Response(ps.stdout).text()).replace(/\D/g, '').trim();
      if (out && Number(out) > 1) return out;
    } else {
      ps.kill();
    }
  } catch {
    // Not on Windows or powershell.exe not available — fall through
  }

  // 4. Day-scoped cache
  const today = new Date();
  const yyyymmdd = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('');
  const cacheFile = join(tmpDir, `onebrain-day-${yyyymmdd}.token`);

  const f = Bun.file(cacheFile);
  const exists = await f.exists();
  if (exists) {
    const cached = (await f.text()).trim();
    const n = Number(cached);
    if (!Number.isNaN(n) && n > 1) return cached;
  }

  // Generate and cache a random 5-digit token (10000–99999)
  const token = String(Math.floor(Math.random() * 90000) + 10000);
  await Bun.write(cacheFile, token);
  return token;
}

// ---------------------------------------------------------------------------
// cleanStaleStateFile
// ---------------------------------------------------------------------------

/**
 * Delete $tmpDir/onebrain-{token}.state if it exists and its mtime is before
 * this process started.
 */
async function cleanStaleStateFile(token: string, tmpDir: string): Promise<void> {
  try {
    // Approximate process start time
    const processStartMs = Date.now() - performance.now();
    const stateFile = join(tmpDir, `onebrain-${token}.state`);
    const f = Bun.file(stateFile);
    const exists = await f.exists();
    if (!exists) return;

    const { mtime } = await f.stat();
    const mtimeMs = mtime instanceof Date ? mtime.getTime() : Number(mtime) * 1000;
    if (mtimeMs < processStartMs) {
      try {
        await unlink(stateFile);
      } catch {
        // Already deleted or never existed — non-fatal
      }
    }
  } catch {
    // Non-fatal — stale cleanup is best-effort
  }
}

// ---------------------------------------------------------------------------
// queryQmdUnembedded
// ---------------------------------------------------------------------------

/**
 * Spawn `qmd status --json` and extract the `unembedded` count.
 * Returns 0 on any error, timeout, or missing binary.
 */
async function queryQmdUnembedded(): Promise<number> {
  try {
    const qmdArgs =
      process.platform === 'win32'
        ? ['powershell.exe', '-NoProfile', '-Command', 'qmd status --json']
        : ['qmd', 'status', '--json'];
    const proc = Bun.spawn(qmdArgs, {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const timeoutMs = 2000;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const race = await Promise.race([
      proc.exited,
      new Promise<'timeout'>((resolve) => {
        timerId = setTimeout(() => resolve('timeout'), timeoutMs);
      }),
    ]);
    if (timerId !== undefined) clearTimeout(timerId);

    if (race === 'timeout') {
      proc.kill();
      return 0;
    }

    const stdout = await new Response(proc.stdout).text();
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const unembedded = parsed['unembedded'];
    return typeof unembedded === 'number' ? unembedded : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// runSessionInit (testable core)
// ---------------------------------------------------------------------------

/**
 * Core logic for session-init.
 * @param vaultRoot - root of the vault (where vault.yml lives)
 * @param tmpDir - override tmpdir (for tests)
 * @returns SessionInitResult
 */
export async function runSessionInit(
  vaultRoot: string,
  tmpDir: string = osTmpdir(),
): Promise<SessionInitResult> {
  // Validate vault.yml — block if missing or malformed
  try {
    await loadVaultConfig(vaultRoot);
  } catch {
    return { decision: 'block', reason: 'onebrain-init-required' };
  }

  // Resolve session token and clean up stale state
  const sessionToken = await resolveSessionToken(tmpDir);
  await cleanStaleStateFile(sessionToken, tmpDir);

  // Format datetime
  const datetime = formatDatetime(new Date());

  // Query qmd
  const qmdUnembedded = await queryQmdUnembedded();

  return {
    datetime,
    session_token: sessionToken,
    qmd_unembedded: qmdUnembedded,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Run session-init as a CLI command: print JSON to stdout, always exit 0.
 */
export async function sessionInitCommand(vaultRoot: string): Promise<void> {
  const result = await runSessionInit(vaultRoot);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
