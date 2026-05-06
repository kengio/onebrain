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
// findClaudeAncestorPid
// ---------------------------------------------------------------------------

/**
 * Result of looking up a process: parent PID + command basename
 * (path-stripped and `.exe`-trimmed; ready for direct equality comparison).
 */
export type ProcInfo = { readonly ppid: number; readonly commBasename: string };

/**
 * A function that returns ProcInfo for a given PID, or null if lookup fails.
 * Injectable so tests can simulate process trees without touching real PIDs.
 */
export type ProcLookup = (pid: number) => ProcInfo | null;

/**
 * Compute the basename of a `comm` value as `ps -o comm=` returns it
 * (which may be a full path on Linux/macOS and may end in `.exe` on Windows).
 * Exported for testing the basename normalization contract.
 */
export function commBasenameOf(raw: string): string {
  return raw
    .trim()
    .replace(/^.*[/\\]/, '')
    .replace(/\.exe$/i, '');
}

/**
 * Default ProcLookup implementation backed by `ps -o ppid=,comm= -p <pid>`.
 *
 * Returns null silently on Windows (no `ps`) — the only *expected* "no lookup"
 * case. On Unix, when `ps` is reachable but returns an unexpected exit code,
 * empty output, or unparseable output, we still return null but emit a one-line
 * warning to stderr first. Without that warning, an unparseable-output regression
 * (e.g. a busybox `ps` variant emitting a header) silently falls back to the
 * day-scoped cache — which is exactly the cross-session collision bug this
 * walk-up was added to prevent.
 */
const defaultProcLookup: ProcLookup = (pid: number): ProcInfo | null => {
  if (process.platform === 'win32') return null;
  let result: ReturnType<typeof Bun.spawnSync>;
  try {
    result = Bun.spawnSync(['ps', '-o', 'ppid=,comm=', '-p', String(pid)], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    // ENOENT on Unix would be very unusual (ps almost always exists); other
    // codes (EACCES from sandboxing, EMFILE/ENOMEM at spawn) are signals the
    // user should see, not silent fallbacks.
    process.stderr.write(`onebrain: ps spawn failed for pid ${pid} (${code ?? 'unknown'})\n`);
    return null;
  }
  if (!result.success) {
    process.stderr.write(`onebrain: ps -p ${pid} exited ${result.exitCode}\n`);
    return null;
  }
  const out = new TextDecoder().decode(result.stdout).trim();
  if (!out) {
    process.stderr.write(`onebrain: ps -p ${pid} returned empty output\n`);
    return null;
  }
  // Expected single-line format: "<ppid> <comm-or-path>".
  // We want exactly one data line; if multiple lines arrived (header leak
  // from a non-standard ps), bail loudly.
  if (out.includes('\n')) {
    process.stderr.write(
      `onebrain: ps -p ${pid} returned multi-line output: ${out.replace(/\n/g, ' | ').slice(0, 120)}\n`,
    );
    return null;
  }
  const match = out.match(/^\s*(\d+)\s+(.+)$/);
  if (!match) {
    process.stderr.write(`onebrain: ps -p ${pid} unparseable: ${out.slice(0, 120)}\n`);
    return null;
  }
  const ppid = Number(match[1]);
  if (Number.isNaN(ppid)) return null;
  return { ppid, commBasename: commBasenameOf(match[2] ?? '') };
};

/**
 * Walk up the process tree from `startPid` looking for a process whose
 * `commBasename` is `claude`. Returns its PID, or null if not found.
 *
 * Capped at 12 hops — empirically deeper than any shell→multiplexer→claude
 * chain seen in practice, shallow enough that a corrupted process table
 * terminates in milliseconds.
 *
 * Why: `process.ppid` here is the ephemeral `bash -c` wrapper Claude Code
 * spawns to run the CLI, not the long-lived `claude` process. The wrapper PID
 * changes between every CLI invocation in the same Claude session, so using
 * it as a token would produce a different identity per call. Walking up to
 * the nearest `claude` ancestor yields one stable PID for the lifetime of the
 * Claude session — the identity we actually want for namespacing checkpoint
 * files across session-init, stop-hook, and orphan-scan calls (all of which
 * share this resolver via `resolveSessionToken`).
 */
export function findClaudeAncestorPid(
  startPid: number,
  lookup: ProcLookup = defaultProcLookup,
  maxDepth = 12,
): number | null {
  let current = startPid;
  for (let i = 0; i < maxDepth; i++) {
    if (current <= 1) return null;
    const info = lookup(current);
    if (!info) return null;
    if (info.commBasename === 'claude') return current;
    if (info.ppid <= 1) {
      // Walked cleanly to init without finding claude — distinct from a
      // lookup failure (which already wrote its own warning). Surfacing this
      // makes the day-cache fallback below visible instead of silent.
      process.stderr.write(
        `onebrain: walk-up reached init from pid ${startPid} without finding claude (last comm=${info.commBasename})\n`,
      );
      return null;
    }
    current = info.ppid;
  }
  process.stderr.write(
    `onebrain: walk-up exhausted ${maxDepth} hops from pid ${startPid} without finding claude\n`,
  );
  return null;
}

// ---------------------------------------------------------------------------
// resolveSessionToken
// ---------------------------------------------------------------------------

/**
 * Resolve session token using priority order:
 * 1. WT_SESSION env var (Windows Terminal — strip non-alphanumeric, first 8 chars)
 * 2. TMUX_PANE env var (tmux — stable per-pane, e.g. "%3" → "3")
 * 3. TERM_SESSION_ID env var (macOS Terminal.app — stable per-tab UUID)
 * 4. Walk up the process tree to find a `claude` ancestor PID (Unix) — stable
 *    per Claude session, returned without touching the cache
 * 5. Day-scoped cache file: $tmpDir/onebrain-day-YYYYMMDD.token (if a valid
 *    cached token exists) — legacy stabilizer with cross-session collision risk
 * 6. process.ppid if > 1 — write to cache, return
 * 7. PowerShell parent PID (Windows fallback) — write to cache, return
 * 8. Random 5-digit fallback — write to cache, return
 *
 * Env-var sources (1–3) are preferred because both session-init and the stop
 * hook run as children of separate bash wrappers (different ppid values),
 * while env vars are inherited from the shared terminal session ancestor.
 *
 * Walk-up (4) covers terminals that set none of those env vars (e.g. Obsidian's
 * terminal plugin on macOS). Without it, every Claude session on the same
 * machine and day shared one cached token because the cache key only encoded
 * the date — that's the bug this resolver path was added to fix.
 *
 * Steps 6–8 are last-resort fallbacks when both the env vars and walk-up fail.
 * Step 6 reuses the unstable wrapper ppid because *some* identity (with the
 * cache stabilizing repeated calls) is better than none; users in this branch
 * accept the day-cache collision risk by virtue of having no better signal.
 */
export async function resolveSessionToken(
  tmpDir: string = osTmpdir(),
  procLookup: ProcLookup = defaultProcLookup,
): Promise<string> {
  // 1. WT_SESSION (Windows Terminal)
  const wtSession = process.env['WT_SESSION'];
  if (wtSession) {
    const stripped = wtSession.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    if (stripped.length > 0) return stripped;
  }

  // 2. TMUX_PANE (tmux — stable across all processes in the same pane)
  const tmuxPane = process.env['TMUX_PANE'];
  if (tmuxPane) {
    const stripped = tmuxPane.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    if (stripped.length > 0) return stripped;
  }

  // 3. TERM_SESSION_ID (macOS Terminal.app — stable per-tab UUID)
  const termSessionId = process.env['TERM_SESSION_ID'];
  if (termSessionId) {
    const stripped = termSessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    if (stripped.length > 0) return stripped;
  }

  // 4. Walk up the process tree to find a `claude` ancestor PID.
  //    On success, return without touching the cache: walk-up is deterministic
  //    per Claude session, so caching adds collision risk without benefit.
  const startPpid = process.ppid;
  if (startPpid !== undefined && startPpid > 1) {
    const claudePid = findClaudeAncestorPid(startPpid, procLookup);
    if (claudePid !== null && claudePid > 1) {
      return String(claudePid);
    }
  }

  // 5. Day-scoped cache — used only when steps 1–4 above all fail. This is
  //    the legacy stabilizer for environments where neither env vars nor the
  //    walk-up can identify a session ancestor; it carries a known collision
  //    risk (one cached token per day, shared across all callers in $TMPDIR).
  const today = new Date();
  const yyyymmdd = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('');
  const cacheFile = join(tmpDir, `onebrain-day-${yyyymmdd}.token`);

  const cacheExists = await Bun.file(cacheFile).exists();
  if (cacheExists) {
    const cached = (await Bun.file(cacheFile).text()).trim();
    const n = Number(cached);
    if (!Number.isNaN(n) && n > 1) return cached;
  }

  // 6. PPID — resolve, write to cache, return
  const ppid = process.ppid;
  if (ppid !== undefined && ppid > 1) {
    const token = String(ppid);
    await Bun.write(cacheFile, token);
    return token;
  }

  // 7. PowerShell fallback (Windows only) — resolve, write to cache, return
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
      if (out && Number(out) > 1) {
        await Bun.write(cacheFile, out);
        return out;
      }
    } else {
      ps.kill();
    }
  } catch {
    // Not on Windows or powershell.exe not available — fall through
  }

  // 8. Generate and cache a random 5-digit token (10000–99999)
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
      } catch (err) {
        const code = (err as NodeJS.ErrnoException | undefined)?.code;
        // ENOENT = lost a delete race with a concurrent caller; silent.
        // EACCES/EPERM = $TMPDIR permissions broken (e.g. file owned by root
        // after a prior `sudo onebrain`) — surface so the user can chmod or
        // remove the file before checkpoint writes start failing too.
        if (code !== 'ENOENT') {
          process.stderr.write(
            `onebrain: cannot remove stale state file ${stateFile} (${code ?? 'unknown'})\n`,
          );
        }
      }
    }
  } catch (err) {
    // stat()/exists() races on the file we just observed are non-fatal, but
    // anything other than ENOENT is worth seeing — it would mask the same
    // permissions class as the unlink branch above.
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code && code !== 'ENOENT') {
      process.stderr.write(`onebrain: cleanStaleStateFile failed (${code})\n`);
    }
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
  procLookup: ProcLookup = defaultProcLookup,
): Promise<SessionInitResult> {
  // Validate vault.yml — block if missing or malformed
  try {
    await loadVaultConfig(vaultRoot);
  } catch {
    return { decision: 'block', reason: 'onebrain-init-required' };
  }

  // Resolve session token and clean up stale state
  const sessionToken = await resolveSessionToken(tmpDir, procLookup);
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
