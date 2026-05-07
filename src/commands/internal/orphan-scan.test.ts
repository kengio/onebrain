import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runOrphanScan } from './orphan-scan.js';

// ---------------------------------------------------------------------------
// Pinned clock
//
// runOrphanScan reads "today" from an injected `now: Date`. Tests must pass
// PINNED_NOW (or another explicit Date) so behavior never depends on the wall
// clock — fixture day numbers were silently colliding with the active-session
// guard whenever today's day matched a hardcoded fixture day.
//
// RULE: Do not call `new Date()` (no args) or `Date.now()` in this file.
// `new Date('<literal ISO string>')` is fine — it's deterministic.
// All other time-dependent values must derive from PINNED_NOW or be hardcoded.
// ---------------------------------------------------------------------------

// 12:00Z is mid-day in UTC — safe across all real-world TZs (≥12h from any local midnight).
//
// PINNED_NOW is intentionally far in the future: the new Active-Session Guard
// (PR #156 follow-up) compares each fixture file's mtime to PINNED_NOW. For
// fixtures that don't pin their own mtime via setMtime(), the on-disk mtime
// is the real wall clock; if PINNED_NOW were close to today, a future test
// run could see wall_clock > PINNED_NOW (negative age), trip the future-mtime
// fail-safe, and silently flip "expected orphan" tests to "skipped active".
// 2099-01-01 keeps fixtures unambiguously in the past relative to PINNED_NOW
// for the foreseeable life of this codebase without breaking any
// month-boundary fixtures (TODAY/PAST_DATE/PREV_DATE all stay in 2098).
const PINNED_NOW = new Date('2099-01-15T12:00:00Z');
const TODAY = '2099-01-15';
const THIS_YEAR = '2099';
const THIS_MONTH = '01';
const PREV_YEAR = '2098';
const PREV_MONTH = '12';
const PAST_DATE = '2099-01-01'; // any day in current month != TODAY
const PREV_DATE = '2098-12-15';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'onebrain-os-test-'));
}

function checkpointName(date: string, token: string, nn: number): string {
  return `${date}-${token}-checkpoint-${String(nn).padStart(2, '0')}.md`;
}

function sessionLogName(date: string, nn: number): string {
  return `${date}-session-${String(nn).padStart(2, '0')}.md`;
}

function checkpointFrontmatter(merged: boolean, date = PAST_DATE): string {
  return `---\ntags: [checkpoint, session-log]\ndate: ${date}\ncheckpoint: 01\ntrigger: stop\nmerged: ${merged}\n---\n\n## What We Worked On\n\nTest content.`;
}

function sessionLogFrontmatter(autoSaved: boolean): string {
  return `---\ntags: [session-log]\ndate: ${PAST_DATE}\nauto-saved: ${autoSaved}\n---\n\n## Session\n\nTest.`;
}

async function makeMonthDir(logsDir: string, year: string, month: string): Promise<string> {
  const dir = join(logsDir, year, month);
  await mkdir(dir, { recursive: true });
  return dir;
}

async function makeThisMonthDir(logsDir: string): Promise<string> {
  return makeMonthDir(logsDir, THIS_YEAR, THIS_MONTH);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runOrphanScan', () => {
  let tmpDir: string;
  let logsDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    logsDir = join(tmpDir, '07-logs');
    await mkdir(logsDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns orphan_count: 0 when no checkpoint files exist', async () => {
    const result = await runOrphanScan(logsDir, 'abc12345', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  // Update snapshots: bun test --update-snapshots
  it('output shape matches snapshot { orphan_count: N }', async () => {
    // Zero orphans — verifies the shape is { orphan_count: 0 }
    const zeroResult = await runOrphanScan(logsDir, 'abc12345', PINNED_NOW, tmpDir);
    expect(zeroResult).toMatchSnapshot();

    // One orphan — verifies the shape is { orphan_count: 1 }
    const monthDir = await makeThisMonthDir(logsDir);
    await writeFile(
      join(monthDir, `${PAST_DATE}-snaptoken-checkpoint-01.md`),
      '---\ntags: [checkpoint]\nmerged: false\n---\n\nContent.',
      'utf8',
    );
    const oneResult = await runOrphanScan(logsDir, 'differenttoken', PINNED_NOW, tmpDir);
    expect(oneResult).toMatchSnapshot();
  });

  it('returns orphan_count: 0 when logs folder does not exist', async () => {
    const result = await runOrphanScan(join(tmpDir, 'nonexistent'), 'abc12345', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  // Since v2.2.0, /wrapup deletes checkpoints directly after the session log
  // is verified — any checkpoint file that still exists is unmerged by
  // definition. Legacy `merged: true` files (and the `merged: "true"` quoted
  // variant) are now treated identically to unmerged files, so the only thing
  // that suppresses an orphan is a manual session log for that date or the
  // current session token match.
  it('counts legacy checkpoint with merged: true as an orphan', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(PAST_DATE, 'token11', 1);
    await writeFile(join(monthDir, fname), checkpointFrontmatter(true), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('counts legacy checkpoint with merged: "true" (quoted string) as an orphan', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(PAST_DATE, 'tokenStrTrue', 1);
    const content = `---\ntags: [checkpoint, session-log]\ndate: ${PAST_DATE}\ncheckpoint: 01\ntrigger: stop\nmerged: "true"\n---\n\n## What We Worked On\n\nTest content.`;
    await writeFile(join(monthDir, fname), content, 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('skips checkpoint files matching current session token', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(PAST_DATE, 'current99', 1);
    await writeFile(join(monthDir, fname), checkpointFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('skips checkpoint when a manual (non-auto-saved) session log exists for that date', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const cpName = checkpointName(PAST_DATE, 'tokenAA', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    const logName = sessionLogName(PAST_DATE, 1);
    await writeFile(join(monthDir, logName), sessionLogFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('does NOT skip when only auto-saved session log exists for that date', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const cpName = checkpointName(PAST_DATE, 'tokenBB', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    const logName = sessionLogName(PAST_DATE, 1);
    await writeFile(join(monthDir, logName), sessionLogFrontmatter(true), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  // Regression: previously the `hasManualSessionLog` filter excluded
  // `-checkpoint-` files but accepted any other date-prefixed `.md`. A
  // `/update` migration log written on the same date as an orphan
  // checkpoint would fall through and silently suppress the orphan
  // count. Filter now whitelists `-session-` so the orphan still counts.
  it('does NOT skip when only an update-log exists for that date (no real session log)', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const cpName = checkpointName(PAST_DATE, 'tokenUL', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    // /update writes YYYY-MM-DD-update-vX.Y.Z.md (no `-session-` infix)
    const updateName = `${PAST_DATE}-update-v2.1.10.md`;
    await writeFile(
      join(monthDir, updateName),
      `---\ntags: [update-log]\ndate: ${PAST_DATE}\nfrom_version: 2.1.9\nto_version: 2.1.10\n---\n\n# Update Log\n\n- [x] Step 1\n`,
      'utf8',
    );
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  // Same bug class as the update-log case: /weekly writes
  // YYYY-MM-DD-weekly.md (no `-session-` infix). Under the old blacklist
  // it would also fall through and silently suppress the orphan count.
  it('does NOT skip when only a weekly log exists for that date (no real session log)', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const cpName = checkpointName(PAST_DATE, 'tokenWL', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    const weeklyName = `${PAST_DATE}-weekly.md`;
    await writeFile(
      join(monthDir, weeklyName),
      `---\ntags: [weekly-review]\ndate: ${PAST_DATE}\n---\n\n# Weekly Review\n`,
      'utf8',
    );
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  // Companion case: both an update log AND a manual session log exist
  // for the same date — the manual session log still wins, orphan
  // suppressed. Verifies the whitelist didn't regress the skip behavior.
  it('still skips when both an update-log and a manual session log exist for that date', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const cpName = checkpointName(PAST_DATE, 'tokenULSL', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    await writeFile(
      join(monthDir, `${PAST_DATE}-update-v2.1.10.md`),
      `---\ntags: [update-log]\ndate: ${PAST_DATE}\n---\n\nUpdate.`,
      'utf8',
    );
    const logName = sessionLogName(PAST_DATE, 1);
    await writeFile(join(monthDir, logName), sessionLogFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('counts unmerged orphan checkpoints from current month', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    for (const token of ['tokenCC', 'tokenDD']) {
      const cpName = checkpointName(PAST_DATE, token, 1);
      await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    }
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 2 });
  });

  it('counts orphans from previous month dir', async () => {
    const monthDir = await makeMonthDir(logsDir, PREV_YEAR, PREV_MONTH);
    const cpName = checkpointName(PREV_DATE, 'tokenEE', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false, PREV_DATE), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('multiple checkpoints for same token in same month count as one orphan session', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    for (let i = 1; i <= 2; i++) {
      const cpName = checkpointName(PAST_DATE, 'tokenFF', i);
      await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    }
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('handles files with missing frontmatter gracefully (counts as orphan)', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const cpName = checkpointName(PAST_DATE, 'tokenGG', 1);
    await writeFile(join(monthDir, cpName), '# No frontmatter here\n\nContent.', 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it("creates a checkpoint file with today's actual date → orphan_count: 0 (today boundary skipped)", async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(TODAY, 'todaytoken', 1);
    await writeFile(join(monthDir, fname), checkpointFrontmatter(false, TODAY), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it("today's file skipped but a past date in same month still counted", async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const todayFname = checkpointName(TODAY, 'todaytoken', 1);
    await writeFile(join(monthDir, todayFname), checkpointFrontmatter(false, TODAY), 'utf8');
    const pastFname = checkpointName(PAST_DATE, 'pasttoken', 1);
    await writeFile(join(monthDir, pastFname), checkpointFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('combines orphans from both months in total count', async () => {
    const thisMonthDir = await makeThisMonthDir(logsDir);
    const prevMonthDir = await makeMonthDir(logsDir, PREV_YEAR, PREV_MONTH);

    await writeFile(
      join(thisMonthDir, checkpointName(PAST_DATE, 'tokenHH', 1)),
      checkpointFrontmatter(false),
      'utf8',
    );
    await writeFile(
      join(prevMonthDir, checkpointName(PREV_DATE, 'tokenII', 1)),
      checkpointFrontmatter(false, PREV_DATE),
      'utf8',
    );

    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 2 });
  });

  // -------------------------------------------------------------------------
  // Active-Session Guard (60-min mtime window) — symmetric with /wrapup PR #156
  // -------------------------------------------------------------------------

  // Helper: pin a file's mtime to a specific moment relative to PINNED_NOW so
  // the guard's `now - mtime` math is deterministic. Uses utimes() with Date
  // objects (the seconds-as-number form depends on platform stat resolution).
  async function setMtime(path: string, mtime: Date): Promise<void> {
    await utimes(path, mtime, mtime);
  }

  // 60 min before PINNED_NOW (boundary: counted as orphan — guard is `< 60`).
  const SIXTY_MIN_AGO = new Date(PINNED_NOW.getTime() - 60 * 60 * 1000);
  // 30 min before PINNED_NOW (active session in another harness — skipped).
  const THIRTY_MIN_AGO = new Date(PINNED_NOW.getTime() - 30 * 60 * 1000);
  // 90 min before PINNED_NOW (clearly stale — counted).
  const NINETY_MIN_AGO = new Date(PINNED_NOW.getTime() - 90 * 60 * 1000);
  // 5 min into the future from PINNED_NOW (clock skew — fail-safe skip).
  const FIVE_MIN_FUTURE = new Date(PINNED_NOW.getTime() + 5 * 60 * 1000);

  it('skips group whose newest checkpoint mtime is < 60 min old (active in another harness)', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(PAST_DATE, 'activeTok', 1);
    const fpath = join(monthDir, fname);
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, THIRTY_MIN_AGO);
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('counts group whose newest checkpoint mtime is exactly 60 min old (boundary)', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(PAST_DATE, 'boundaryTok', 1);
    const fpath = join(monthDir, fname);
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, SIXTY_MIN_AGO);
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('counts group whose newest checkpoint mtime is > 60 min old (truly stale)', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(PAST_DATE, 'staleTok', 1);
    const fpath = join(monthDir, fname);
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, NINETY_MIN_AGO);
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('newest mtime wins: group with one stale + one fresh checkpoint is skipped', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const oldFname = checkpointName(PAST_DATE, 'mixTok', 1);
    const newFname = checkpointName(PAST_DATE, 'mixTok', 2);
    const oldPath = join(monthDir, oldFname);
    const newPath = join(monthDir, newFname);
    await writeFile(oldPath, checkpointFrontmatter(false), 'utf8');
    await writeFile(newPath, checkpointFrontmatter(false), 'utf8');
    await setMtime(oldPath, NINETY_MIN_AGO);
    await setMtime(newPath, THIRTY_MIN_AGO);
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('fail-safe: future mtime (clock skew, negative age) is skipped, not counted', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(PAST_DATE, 'skewTok', 1);
    const fpath = join(monthDir, fname);
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, FIVE_MIN_FUTURE);
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('cross-month group: token spanning both months is evaluated against globally-newest mtime', async () => {
    // Same token has files in both months: prev-month file is stale,
    // current-month file is fresh. Newest wins → group is active → skip.
    const thisMonth = await makeThisMonthDir(logsDir);
    const prevMonth = await makeMonthDir(logsDir, PREV_YEAR, PREV_MONTH);
    const thisPath = join(thisMonth, checkpointName(PAST_DATE, 'crossTok', 2));
    const prevPath = join(prevMonth, checkpointName(PREV_DATE, 'crossTok', 1));
    await writeFile(thisPath, checkpointFrontmatter(false), 'utf8');
    await writeFile(prevPath, checkpointFrontmatter(false, PREV_DATE), 'utf8');
    await setMtime(thisPath, THIRTY_MIN_AGO);
    await setMtime(prevPath, NINETY_MIN_AGO);
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('mixed groups: one stale (counted) + one active (skipped) → orphan_count: 1', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const stalePath = join(monthDir, checkpointName(PAST_DATE, 'staleMixTok', 1));
    const activePath = join(monthDir, checkpointName(PAST_DATE, 'activeMixTok', 1));
    await writeFile(stalePath, checkpointFrontmatter(false), 'utf8');
    await writeFile(activePath, checkpointFrontmatter(false), 'utf8');
    await setMtime(stalePath, NINETY_MIN_AGO);
    await setMtime(activePath, THIRTY_MIN_AGO);
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  // Regression guard: proves the suite is wall-clock-independent.
  // Same fixture file, three different injected `now` values, three
  // different outcomes — confirms the today-skip is driven by the
  // injected clock, not by `new Date()` leaking in.
  //
  // Uses anchor dates inside 2099 (sharing PINNED_NOW's epoch) so the fixture
  // and the three injected `now` values all sit inside the same month/prev-month
  // window the scanner walks. After PINNED_NOW was bumped to 2099 to keep
  // wall-clock mtimes safely in the past, this test was rewritten to use
  // 2099 anchor dates rather than the original 2026 ones — the original
  // dates fell outside the 2099-anchored month dirs and the scanner found
  // no fixture to evaluate.
  it('today-skip is driven by injected `now`, not by wall-clock', async () => {
    // Pre-pin the fixture's mtime so the new Active-Session Guard never
    // fires on this regression test (the guard depends on mtime, not on
    // the injected `now` — the test is about today-skip semantics, not
    // about the active-session guard).
    const fixtureDate = '2099-02-10';
    const fixtureMonthDir = await makeMonthDir(logsDir, '2099', '02');
    const fname = checkpointName(fixtureDate, 'reg-token', 1);
    const fpath = join(fixtureMonthDir, fname);
    await writeFile(fpath, checkpointFrontmatter(false, fixtureDate), 'utf8');
    // Pin mtime well past the largest configurable threshold so every
    // `now` value below sees the fixture as "stale enough to count".
    await setMtime(fpath, NINETY_MIN_AGO);

    // now = Feb 10 → fixture date == today → skipped (today-skip path)
    const sameDay = await runOrphanScan(
      logsDir,
      'current99',
      new Date('2099-02-10T12:00:00Z'),
      tmpDir,
    );
    expect(sameDay).toEqual({ orphan_count: 0 });

    // now = Feb 15 → fixture is a past date in the same month → counted
    const laterSameMonth = await runOrphanScan(
      logsDir,
      'current99',
      new Date('2099-02-15T12:00:00Z'),
      tmpDir,
    );
    expect(laterSameMonth).toEqual({ orphan_count: 1 });

    // now = Mar 5 → fixture is in previous month → still counted
    const nextMonth = await runOrphanScan(
      logsDir,
      'current99',
      new Date('2099-03-05T12:00:00Z'),
      tmpDir,
    );
    expect(nextMonth).toEqual({ orphan_count: 1 });
  });

  // -------------------------------------------------------------------------
  // Configurable Active-Session Guard threshold (vault.yml-driven)
  //
  // Policy (orphan-scan.ts: getActiveSessionGuardMs): the threshold is
  // `max(60, 2 * checkpoint.minutes)` minutes, derived from vault.yml in
  // the supplied vaultRoot. Failure modes (missing/malformed vault.yml,
  // non-positive checkpoint.minutes) silently fall back to 60 minutes.
  // -------------------------------------------------------------------------

  // Minimal valid vault.yml: only the keys the parser actually requires
  // beyond defaults. `loadVaultConfig` synthesises folders + update_channel
  // when absent, so we pin only the field under test.
  async function writeVaultYml(vaultRoot: string, body: string): Promise<void> {
    await writeFile(join(vaultRoot, 'vault.yml'), body, 'utf8');
  }

  it('uses default 60-min threshold when vault.yml is absent (existing behavior)', async () => {
    // Without vault.yml, getActiveSessionGuardMs falls back to 60 min.
    // 50-min-old checkpoint is younger than the threshold → skipped.
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'fallbackTok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, new Date(PINNED_NOW.getTime() - 50 * 60 * 1000));
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('checkpoint.minutes=60 raises threshold to 120 — 90-min-old group still skipped', async () => {
    // checkpoint.minutes=60 → max(60, 2*60)=120 min threshold.
    // A 90-min-old group is younger than 120 → still active → skipped.
    // Under the old 60-min hard-coded threshold this would have been
    // counted as an orphan.
    await writeVaultYml(tmpDir, 'checkpoint:\n  messages: 15\n  minutes: 60\n');
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'cp60ActiveTok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, NINETY_MIN_AGO);
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('checkpoint.minutes=60 with 130-min-old group → counted (past raised threshold)', async () => {
    // Above-threshold age still counts even with a raised guard, so the
    // policy doesn't silently swallow truly stale groups.
    await writeVaultYml(tmpDir, 'checkpoint:\n  messages: 15\n  minutes: 60\n');
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'cp60StaleTok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, new Date(PINNED_NOW.getTime() - 130 * 60 * 1000));
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('checkpoint.minutes=15 keeps threshold at 60-min floor (max wins, not 30)', async () => {
    // Policy: max(60, 2*15)=60. A user who lowered checkpoint.minutes
    // below 30 doesn't accidentally tighten the guard below the PR #156
    // baseline. 50-min-old → still active.
    await writeVaultYml(tmpDir, 'checkpoint:\n  messages: 15\n  minutes: 15\n');
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'cp15Tok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, new Date(PINNED_NOW.getTime() - 50 * 60 * 1000));
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('malformed vault.yml falls back to 60-min default (no startup blocking)', async () => {
    // YAML that loadVaultConfig will throw on (top-level array, not a
    // mapping). Fail-safe falls back to 60-min default → 50-min-old
    // group is still active and skipped. The stderr warning side-effect
    // is asserted separately below; suppress it here so test output
    // stays clean.
    await writeVaultYml(tmpDir, '- not\n- a\n- mapping\n');
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'malformedTok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, new Date(PINNED_NOW.getTime() - 50 * 60 * 1000));
    const { result } = await captureStderr(() =>
      runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir),
    );
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('vault.yml without checkpoint key uses parser default (30 min) → threshold 60', async () => {
    // loadVaultConfig defaults checkpoint.minutes to 30 when the
    // `checkpoint` key is absent. Threshold = max(60, 2*30) = 60.
    // 50-min-old group is younger → skipped.
    await writeVaultYml(tmpDir, 'update_channel: stable\n');
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'noCpKeyTok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, new Date(PINNED_NOW.getTime() - 50 * 60 * 1000));
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('vault.yml with non-positive checkpoint.minutes falls back to 60-min default', async () => {
    // checkpoint.minutes <= 0 is malformed config — getActiveSessionGuardMs
    // skips it rather than producing a zero-or-negative threshold (which
    // would count every checkpoint as orphan, including in-flight ones).
    await writeVaultYml(tmpDir, 'checkpoint:\n  messages: 15\n  minutes: 0\n');
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'cpZeroTok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, new Date(PINNED_NOW.getTime() - 50 * 60 * 1000));
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
    expect(result).toEqual({ orphan_count: 0 });
  });

  // -------------------------------------------------------------------------
  // Telemetry + input validation (review round 1 follow-ups)
  //
  // Silent fallbacks hide real bugs. These tests pin the contract:
  // - vault.yml NOT FOUND → silent fallback (expected absence; some banner
  //   consumers run from non-vault dirs).
  // - vault.yml UNREADABLE for any other reason → stderr warning + fallback
  //   (the user must be able to discover that their config is being ignored).
  // - vaultRoot empty string → throw (programming bug; never silently
  //   consume a stranger vault.yml resolved against process.cwd()).
  // -------------------------------------------------------------------------

  /**
   * Run an async callback while capturing process.stderr writes. Returns
   * the captured string. Restores the original write hook even on throw.
   */
  async function captureStderr<T>(fn: () => Promise<T>): Promise<{ stderr: string; result: T }> {
    const original = process.stderr.write.bind(process.stderr);
    let captured = '';
    // process.stderr.write has multiple overloads; cast through unknown to
    // sidestep them — the test only ever calls it with a string.
    process.stderr.write = ((chunk: string) => {
      captured += chunk;
      return true;
    }) as unknown as typeof process.stderr.write;
    try {
      const result = await fn();
      return { stderr: captured, result };
    } finally {
      process.stderr.write = original;
    }
  }

  it('missing vault.yml is silent (expected absence — no stderr noise)', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'silentTok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, NINETY_MIN_AGO);
    const { stderr } = await captureStderr(() =>
      runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir),
    );
    expect(stderr).toBe('');
  });

  it('malformed vault.yml writes a one-line warning to stderr and falls back', async () => {
    await writeVaultYml(tmpDir, '- not\n- a\n- mapping\n');
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'malformedWarnTok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, NINETY_MIN_AGO);
    const { stderr, result } = await captureStderr(() =>
      runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir),
    );
    expect(stderr).toContain('onebrain orphan-scan: vault.yml unreadable');
    expect(stderr).toContain('60-min Active-Session Guard default');
    expect(stderr.endsWith('\n')).toBe(true);
    // Fallback still applied — orphan still counted (NINETY_MIN_AGO > 60-min default).
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('prefix-not-substring: parser errors that merely contain "vault.yml not found" still emit the warning', async () => {
    // Pin the contract that the round-1 P0 fix relies on: a parse error
    // whose message *contains* the substring "vault.yml not found" but
    // does NOT start with the canonical prefix `vault.yml not found at `
    // must NOT be silently classified as an expected absence.
    //
    // To force this, we write yaml that parses to a top-level array (the
    // parser path that throws `vault.yml must be a YAML mapping. Got: array`)
    // but include the literal substring `vault.yml not found` in the
    // body. The yaml parser succeeds; the mapping check fails; the
    // resulting Error.message starts with `vault.yml must be a YAML
    // mapping`, not the prefix — so the classifier must reject and the
    // stderr warning must fire.
    await writeVaultYml(tmpDir, '- "vault.yml not found"\n- "in this array"\n');
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'subTok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, NINETY_MIN_AGO);
    const { stderr, result } = await captureStderr(() =>
      runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir),
    );
    // The error message contains the substring but doesn't START with
    // the prefix → classifier returns false → warning fires.
    expect(stderr).toContain('onebrain orphan-scan: vault.yml unreadable');
    expect(stderr).toContain('YAML mapping');
    // Fallback still applied — orphan still counted.
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('stderr write that throws does not crash the JSON contract (EPIPE fallback)', async () => {
    // Simulate stderr being closed (EPIPE-class condition). The warning
    // is best-effort; under no circumstance should it bubble up and
    // replace the stdout JSON contract with a thrown stack trace. The
    // banner consumer would then fall back to its own default and the
    // user would lose both the warning AND the orphan count.
    await writeVaultYml(tmpDir, '- not\n- a\n- mapping\n');
    const monthDir = await makeThisMonthDir(logsDir);
    const fpath = join(monthDir, checkpointName(PAST_DATE, 'epipeTok', 1));
    await writeFile(fpath, checkpointFrontmatter(false), 'utf8');
    await setMtime(fpath, NINETY_MIN_AGO);
    const original = process.stderr.write.bind(process.stderr);
    process.stderr.write = (() => {
      throw new Error('EPIPE: broken pipe');
    }) as unknown as typeof process.stderr.write;
    try {
      // Must not throw; result must still be correct (orphan counted).
      const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW, tmpDir);
      expect(result).toEqual({ orphan_count: 1 });
    } finally {
      process.stderr.write = original;
    }
  });

  it('throws when vaultRoot is empty (programming bug, fail loud)', async () => {
    // Passing empty string would resolve `vault.yml` against process.cwd()
    // and could silently consume an unrelated vault.yml. The CLI wrapper
    // always passes process.cwd() (non-empty), so this only protects
    // future programmatic callers.
    await expect(runOrphanScan(logsDir, 'current99', PINNED_NOW, '')).rejects.toThrow(
      'vaultRoot is required',
    );
  });
});
