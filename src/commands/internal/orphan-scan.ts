/**
 * orphan-scan — internal command
 *
 * Scans the logs folder for unmerged checkpoint files (orphans).
 * An orphan is a checkpoint whose session was never wrapped up via /wrapup.
 *
 * Active-Session Guard: groups whose newest checkpoint is younger than the
 * vault.yml-derived threshold are NOT counted as orphans — they belong to
 * a still-active session in another harness (Claude + Gemini in the same
 * vault see each other's tokens as "non-current"). Symmetric with the
 * guard in /wrapup Step 1b (PR #156) so the startup banner doesn't
 * false-positive when /wrapup correctly skips the same files.
 *
 * Threshold policy: `max(60, 2 * checkpoint.minutes)` minutes. Default
 * checkpoint.minutes is 30 → 60-min threshold (unchanged from PR #156).
 * Users who raise checkpoint.minutes (e.g. 60 or 90) get a proportionally
 * larger guard so legitimate live sessions don't get false-positived.
 *
 * Output: JSON { orphan_count: N }
 * Exit code always 0.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { VAULT_YML_NOT_FOUND_PREFIX, loadVaultConfig } from '../../lib/parser.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrphanScanResult = {
  orphan_count: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum acceptable Active-Session Guard threshold, in minutes. Used as
 * the floor in the `max(MIN_GUARD_MINUTES, 2 * checkpoint.minutes)` policy
 * so a user who lowered `checkpoint.minutes` below 30 doesn't accidentally
 * tighten the guard below the PR #156 baseline. Distinct semantics from
 * `DEFAULT_ACTIVE_SESSION_GUARD_MS` — the floor coincides with the default
 * fallback today by calibration, not by invariant. Keep them separate so
 * a future change to `DEFAULT_CHECKPOINT.minutes` doesn't accidentally
 * shift the user-visible floor.
 */
const MIN_GUARD_MINUTES = 60;

/**
 * Default Active-Session Guard threshold in milliseconds, used when
 * vault.yml is missing, malformed, or has no usable `checkpoint.minutes`.
 * Mirrors the original 60-min hard-coded window in /wrapup SKILL.md
 * Step 1b — two full default 30-min checkpoint windows. The banner is
 * best-effort information; a config issue must not block startup, so any
 * vault.yml read failure falls back here rather than throwing.
 */
const DEFAULT_ACTIVE_SESSION_GUARD_MS = 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Frontmatter helpers
// ---------------------------------------------------------------------------

/**
 * Extract YAML frontmatter from markdown text.
 * Returns parsed object or null if no valid frontmatter.
 */
function parseFrontmatter(rawText: string): Record<string, unknown> | null {
  const text = rawText.replace(/\r\n/g, '\n');
  if (!text.startsWith('---')) return null;
  const endIdx = text.indexOf('\n---', 3);
  if (endIdx === -1) return null;
  const fm = text.slice(3, endIdx).trim();
  try {
    const parsed = parse(fm);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Month directory helpers
// ---------------------------------------------------------------------------

/**
 * Get current and previous month as { thisYear, thisMonth, prevYear, prevMonth }
 * All values are zero-padded strings.
 */
function getMonthParts(now: Date = new Date()): {
  thisYear: string;
  thisMonth: string;
  prevYear: string;
  prevMonth: string;
} {
  const thisYear = String(now.getFullYear());
  const thisMonth = String(now.getMonth() + 1).padStart(2, '0');

  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYear = String(prevDate.getFullYear());
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');

  return { thisYear, thisMonth, prevYear, prevMonth };
}

// ---------------------------------------------------------------------------
// File listing helper
// ---------------------------------------------------------------------------

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((e) => e.endsWith('.md'));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Active-Session Guard helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the Active-Session Guard threshold in milliseconds from
 * `vault.yml`'s `checkpoint.minutes`. Policy: `max(MIN_GUARD_MINUTES,
 * 2 * checkpoint.minutes)` minutes — gives every harness two full
 * checkpoint windows of "live session" grace, regardless of how
 * `checkpoint.minutes` was customized. The floor preserves the PR #156
 * baseline so users who lowered `checkpoint.minutes` below 30 don't
 * accidentally tighten the guard.
 *
 * Fail-safe behavior, with telemetry:
 * - **Expected absence** (vault.yml not found, ENOENT): silently fall back
 *   to the default. Some banner consumers run from non-vault directories.
 * - **Real malformation** (parse error, non-mapping root, EACCES, etc.):
 *   write a one-line warning to stderr so the user can discover that
 *   their config is being ignored, then fall back. The startup banner
 *   parses stdout JSON only, so stderr can carry diagnostic noise without
 *   corrupting the JSON contract.
 * - **Non-finite/non-positive `checkpoint.minutes`**: silently fall back.
 *   The yaml lib already coerced the value; bad user input here surfaces
 *   via /doctor's checkpoint validator (src/lib/validator.ts), not here.
 *
 * Either way, the function returns a positive number — the banner must
 * not block on a config issue.
 */
async function getActiveSessionGuardMs(vaultRoot: string): Promise<number> {
  try {
    const config = await loadVaultConfig(vaultRoot);
    const cpMinutes = config.checkpoint.minutes;
    if (typeof cpMinutes !== 'number' || !Number.isFinite(cpMinutes) || cpMinutes <= 0) {
      return DEFAULT_ACTIVE_SESSION_GUARD_MS;
    }
    const minutes = Math.max(MIN_GUARD_MINUTES, 2 * cpMinutes);
    return minutes * 60 * 1000;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // ENOENT-style "vault.yml not found at <path>." messages are produced
    // by loadVaultConfig itself; match the prefix using the shared
    // exported constant so changing the message in parser.ts propagates
    // here automatically (no two-file string drift). A malformed vault.yml
    // whose error message merely *contains* the substring would not slip
    // through silently — `startsWith` requires the full prefix.
    const isExpectedAbsence = msg.startsWith(VAULT_YML_NOT_FOUND_PREFIX);
    if (!isExpectedAbsence) {
      try {
        process.stderr.write(
          `onebrain orphan-scan: vault.yml unreadable, using ${MIN_GUARD_MINUTES}-min Active-Session Guard default (${msg})\n`,
        );
      } catch {
        // stderr is closed/full (EPIPE/ENOSPC) — best-effort warning.
        // Continue with the default rather than crashing the JSON
        // contract on stdout. The user loses the warning in this rare
        // edge case but the banner still surfaces orphan_count correctly.
      }
    }
    return DEFAULT_ACTIVE_SESSION_GUARD_MS;
  }
}

/**
 * Get a single file's mtime in epoch milliseconds, or null on any error
 * (vanished, EACCES, NFS hiccup, unparseable mtime). Caller treats null
 * as "ambiguous" — fail-safe: skip rather than count.
 */
async function getMtimeMs(path: string): Promise<number | null> {
  try {
    const s = await stat(path);
    if (typeof s.mtimeMs !== 'number' || !Number.isFinite(s.mtimeMs)) return null;
    return s.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Get the newest mtime across a list of files. Returns null if the list is
 * empty OR any single stat failed (fail-safe propagation — one ambiguous
 * file forces the whole group to be treated as ambiguous, never partially
 * counted).
 */
async function getNewestMtimeMs(filePaths: string[]): Promise<number | null> {
  if (filePaths.length === 0) return null;
  let newest = Number.NEGATIVE_INFINITY;
  for (const p of filePaths) {
    const m = await getMtimeMs(p);
    if (m === null) return null;
    if (m > newest) newest = m;
  }
  return Number.isFinite(newest) ? newest : null;
}

/**
 * Decide whether a group of checkpoint files belongs to a still-active
 * session in another harness (or is otherwise ambiguous and unsafe to
 * count). Returns true → caller MUST NOT count this group as an orphan.
 *
 * Fail-safe: any stat failure, negative age (future mtime / clock skew),
 * or empty group forces a skip. The destructive default (count as orphan
 * under uncertainty) is forbidden — the symmetric /wrapup recovery uses
 * the same rule, so a banner that surfaces an "orphan" the wrapup will
 * refuse to recover would be a confusing UX loop.
 */
async function isGroupActiveOrAmbiguous(
  filePaths: string[],
  nowMs: number,
  guardMs: number,
): Promise<boolean> {
  // Belt-and-suspenders: only `runOrphanScan` calls this, and it derives
  // `guardMs` from `getActiveSessionGuardMs` which floors at
  // `MIN_GUARD_MINUTES * 60 * 1000` (positive). A future refactor that
  // lets a different caller bypass that helper could pass a non-positive
  // `guardMs` and silently flip every group to "counted as orphan" —
  // which under /wrapup symmetry would destructively act on live
  // sessions. Treat invalid input the same as ambiguous (skip).
  if (!Number.isFinite(guardMs) || guardMs <= 0) return true;
  const newest = await getNewestMtimeMs(filePaths);
  if (newest === null) return true;
  const ageMs = nowMs - newest;
  if (ageMs < 0) return true;
  return ageMs < guardMs;
}

// ---------------------------------------------------------------------------
// Core scan logic
// ---------------------------------------------------------------------------

/**
 * Check whether a given date has a manually-run session log (non-auto-saved).
 * Returns true if such a log exists.
 */
async function hasManualSessionLog(monthDir: string, date: string): Promise<boolean> {
  const files = await listMdFiles(monthDir);
  // Whitelist `-session-` infix (not blacklist `-checkpoint-`). The logs
  // folder also contains `*-update-vX.Y.Z.md` migration logs from `/update`
  // and `*-weekly.md` files from `/weekly`. With the previous blacklist
  // filter, those would fall through and silently suppress the orphan
  // count for any date that happens to have one of them alongside a real
  // orphan checkpoint. The whitelist guarantees we only consider files
  // that actually look like session logs.
  const sessionLogs = files.filter(
    (f) => f.startsWith(date) && f.includes('-session-') && f.endsWith('.md'),
  );

  for (const logName of sessionLogs) {
    try {
      const content = await readFile(join(monthDir, logName), 'utf8');
      const fm = parseFrontmatter(content);
      // auto-saved: true → written by auto-summary, NOT a wrapup log → keep scanning
      if (fm && (fm['auto-saved'] === true || fm['auto-saved'] === 'true')) continue;
      // Either no frontmatter or auto-saved is false/absent → this is a manual wrapup log
      return true;
    } catch {
      // Can't read — skip
    }
  }
  return false;
}

/**
 * Collect candidate orphan groups from a single month directory.
 * Returns a Map of `token → absolute file paths`. A "candidate" is any
 * checkpoint file whose token != current session, whose date != today,
 * and whose date has no manual session log (the `merged: true`
 * frontmatter check from earlier versions was removed in v2.2.0 — the
 * filename surviving on disk is now the orphan signal).
 *
 * Active-Session mtime filtering is intentionally NOT applied here — the
 * guard runs once at the merged-across-months level, so a token whose
 * checkpoints span both months is evaluated against its globally-newest
 * mtime (not per-month).
 */
async function collectCandidateGroupsForMonth(
  monthDir: string,
  currentToken: string,
  today: string,
): Promise<Map<string, string[]>> {
  const groups = new Map<string, string[]>();
  const files = await listMdFiles(monthDir);
  const checkpoints = files.filter((f) => f.includes('-checkpoint-') && f.endsWith('.md'));

  // Cache per-date "manual session log exists?" lookups: many checkpoints
  // typically share the same date, and hasManualSessionLog re-reads every
  // session log's frontmatter on every call.
  const manualLogCache = new Map<string, boolean>();
  async function dateHasManualLog(date: string): Promise<boolean> {
    const cached = manualLogCache.get(date);
    if (cached !== undefined) return cached;
    const result = await hasManualSessionLog(monthDir, date);
    manualLogCache.set(date, result);
    return result;
  }

  for (const fname of checkpoints) {
    // Filename format: YYYY-MM-DD-{session_token}-checkpoint-NN.md
    const dateMatch = fname.match(/^(\d{4}-\d{2}-\d{2})-/);
    if (!dateMatch) continue;
    const fdate = dateMatch[1] ?? '';

    // Extract token: everything between date- prefix and -checkpoint-
    const afterDate = fname.slice(fdate.length + 1);
    const cpIdx = afterDate.indexOf('-checkpoint-');
    if (cpIdx === -1) continue;
    const ftoken = afterDate.slice(0, cpIdx);
    if (!ftoken) continue;

    // Skip today's checkpoints — not orphans yet (still being written).
    // The mtime guard below catches cross-day active sessions whose
    // filename date is yesterday but mtime is fresh.
    if (fdate === today) continue;

    // Skip current session's own checkpoints
    if (ftoken === currentToken) continue;

    // Skip if a manual session log covers this date
    if (await dateHasManualLog(fdate)) continue;

    const fpath = join(monthDir, fname);
    const existing = groups.get(ftoken);
    if (existing) existing.push(fpath);
    else groups.set(ftoken, [fpath]);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// runOrphanScan (testable core)
// ---------------------------------------------------------------------------

/**
 * Core logic for orphan-scan.
 *
 * Performs one I/O-bound `vault.yml` read per call (via
 * `getActiveSessionGuardMs`). Intended for one-shot invocation per
 * process — the CLI entry below calls it exactly once at startup. A
 * future loop-style caller (watcher, doctor sub-step) should refactor to
 * accept a pre-resolved `guardMs` (or `VaultConfig`) so the read can be
 * hoisted out of the loop.
 *
 * @param logsFolder - absolute or vault-root-relative path to the logs
 *   folder. Must be non-empty.
 * @param sessionToken - current session token to exclude from the orphan
 *   scan. Tokens may be the empty string only if the caller has already
 *   confirmed there's no current session (rare).
 * @param now - reference time used for the today-skip, prev-month math, and
 *   Active-Session Guard age comparison. Required (no default) so tests
 *   can't silently leak the wall clock by forgetting to pass it; production
 *   callers pass `new Date()` explicitly.
 * @param vaultRoot - directory containing vault.yml. Used to derive the
 *   Active-Session Guard threshold from `checkpoint.minutes`. Required and
 *   must be non-empty — an empty string would resolve `vault.yml` against
 *   `process.cwd()` and could silently consume an unrelated vault.yml.
 *   Tests must opt in to a specific vault config or pass a directory
 *   without vault.yml to exercise the 60-min default. Production callers
 *   pass `process.cwd()`, since `onebrain orphan-scan` is invoked from
 *   vault root by the startup procedure.
 * @returns OrphanScanResult
 * @throws if `vaultRoot` is empty (programming bug — fail loud rather
 *   than silently consume a stranger vault.yml).
 */
export async function runOrphanScan(
  logsFolder: string,
  sessionToken: string,
  now: Date,
  vaultRoot: string,
): Promise<OrphanScanResult> {
  if (!vaultRoot) {
    throw new Error('runOrphanScan: vaultRoot is required and must be a non-empty path');
  }
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const { thisYear, thisMonth, prevYear, prevMonth } = getMonthParts(now);

  const monthDirs: Array<{ year: string; month: string }> = [
    { year: thisYear, month: thisMonth },
    { year: prevYear, month: prevMonth },
  ];

  // Merge candidate groups across months keyed by token. A session that
  // crosses a month boundary will surface here as one entry whose file
  // list spans both directories, so the mtime guard sees its globally
  // newest checkpoint and the group is correctly classified.
  const allGroups = new Map<string, string[]>();
  for (const { year, month } of monthDirs) {
    const monthDir = join(logsFolder, year, month);
    const monthGroups = await collectCandidateGroupsForMonth(monthDir, sessionToken, today);
    for (const [token, files] of monthGroups) {
      const existing = allGroups.get(token);
      if (existing) existing.push(...files);
      else allGroups.set(token, [...files]);
    }
  }

  // Resolve threshold once per call — cheap (one vault.yml read) and keeps
  // the per-group guard pure (no I/O ordering concerns inside the loop).
  const guardMs = await getActiveSessionGuardMs(vaultRoot);
  const nowMs = now.getTime();
  let totalOrphans = 0;
  for (const [, files] of allGroups) {
    if (await isGroupActiveOrAmbiguous(files, nowMs, guardMs)) continue;
    totalOrphans++;
  }

  return { orphan_count: totalOrphans };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Run orphan-scan as a CLI command: print JSON to stdout, always exit 0.
 *
 * `process.cwd()` is the vault root: the startup procedure documented in
 * `.claude/plugins/onebrain/INSTRUCTIONS.md` invokes `onebrain orphan-scan`
 * from the vault root, so `cwd` is the canonical source for vault.yml
 * lookup. If invocation pattern changes, update this call site too.
 */
export async function orphanScanCommand(logsFolder: string, sessionToken: string): Promise<void> {
  const result = await runOrphanScan(logsFolder, sessionToken, new Date(), process.cwd());
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
