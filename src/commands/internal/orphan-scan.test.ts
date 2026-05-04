import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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

const PINNED_NOW = new Date('2026-05-15T12:00:00Z');
const TODAY = '2026-05-15';
const THIS_YEAR = '2026';
const THIS_MONTH = '05';
const PREV_YEAR = '2026';
const PREV_MONTH = '04';
const PAST_DATE = '2026-05-01'; // any day in current month != TODAY
const PREV_DATE = '2026-04-15';

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
    const result = await runOrphanScan(logsDir, 'abc12345', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 0 });
  });

  // Update snapshots: bun test --update-snapshots
  it('output shape matches snapshot { orphan_count: N }', async () => {
    // Zero orphans — verifies the shape is { orphan_count: 0 }
    const zeroResult = await runOrphanScan(logsDir, 'abc12345', PINNED_NOW);
    expect(zeroResult).toMatchSnapshot();

    // One orphan — verifies the shape is { orphan_count: 1 }
    const monthDir = await makeThisMonthDir(logsDir);
    await writeFile(
      join(monthDir, `${PAST_DATE}-snaptoken-checkpoint-01.md`),
      '---\ntags: [checkpoint]\nmerged: false\n---\n\nContent.',
      'utf8',
    );
    const oneResult = await runOrphanScan(logsDir, 'differenttoken', PINNED_NOW);
    expect(oneResult).toMatchSnapshot();
  });

  it('returns orphan_count: 0 when logs folder does not exist', async () => {
    const result = await runOrphanScan(join(tmpDir, 'nonexistent'), 'abc12345', PINNED_NOW);
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
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('counts legacy checkpoint with merged: "true" (quoted string) as an orphan', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(PAST_DATE, 'tokenStrTrue', 1);
    const content = `---\ntags: [checkpoint, session-log]\ndate: ${PAST_DATE}\ncheckpoint: 01\ntrigger: stop\nmerged: "true"\n---\n\n## What We Worked On\n\nTest content.`;
    await writeFile(join(monthDir, fname), content, 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('skips checkpoint files matching current session token', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(PAST_DATE, 'current99', 1);
    await writeFile(join(monthDir, fname), checkpointFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('skips checkpoint when a manual (non-auto-saved) session log exists for that date', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const cpName = checkpointName(PAST_DATE, 'tokenAA', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    const logName = sessionLogName(PAST_DATE, 1);
    await writeFile(join(monthDir, logName), sessionLogFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('does NOT skip when only auto-saved session log exists for that date', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const cpName = checkpointName(PAST_DATE, 'tokenBB', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    const logName = sessionLogName(PAST_DATE, 1);
    await writeFile(join(monthDir, logName), sessionLogFrontmatter(true), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('counts unmerged orphan checkpoints from current month', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    for (const token of ['tokenCC', 'tokenDD']) {
      const cpName = checkpointName(PAST_DATE, token, 1);
      await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    }
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 2 });
  });

  it('counts orphans from previous month dir', async () => {
    const monthDir = await makeMonthDir(logsDir, PREV_YEAR, PREV_MONTH);
    const cpName = checkpointName(PREV_DATE, 'tokenEE', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false, PREV_DATE), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('multiple checkpoints for same token in same month count as one orphan session', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    for (let i = 1; i <= 2; i++) {
      const cpName = checkpointName(PAST_DATE, 'tokenFF', i);
      await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    }
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('handles files with missing frontmatter gracefully (counts as orphan)', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const cpName = checkpointName(PAST_DATE, 'tokenGG', 1);
    await writeFile(join(monthDir, cpName), '# No frontmatter here\n\nContent.', 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 1 });
  });

  it("creates a checkpoint file with today's actual date → orphan_count: 0 (today boundary skipped)", async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fname = checkpointName(TODAY, 'todaytoken', 1);
    await writeFile(join(monthDir, fname), checkpointFrontmatter(false, TODAY), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 0 });
  });

  it("today's file skipped but a past date in same month still counted", async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const todayFname = checkpointName(TODAY, 'todaytoken', 1);
    await writeFile(join(monthDir, todayFname), checkpointFrontmatter(false, TODAY), 'utf8');
    const pastFname = checkpointName(PAST_DATE, 'pasttoken', 1);
    await writeFile(join(monthDir, pastFname), checkpointFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
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

    const result = await runOrphanScan(logsDir, 'current99', PINNED_NOW);
    expect(result).toEqual({ orphan_count: 2 });
  });

  // Regression guard: proves the suite is wall-clock-independent.
  // Same fixture file, three different injected `now` values, three
  // different outcomes — confirms the today-skip is driven by the
  // injected clock, not by `new Date()` leaking in.
  it('today-skip is driven by injected `now`, not by wall-clock', async () => {
    const monthDir = await makeThisMonthDir(logsDir);
    const fixtureDate = '2026-05-10';
    const fname = checkpointName(fixtureDate, 'reg-token', 1);
    await writeFile(join(monthDir, fname), checkpointFrontmatter(false, fixtureDate), 'utf8');

    // now = May 10 → fixture date == today → skipped
    const sameDay = await runOrphanScan(logsDir, 'current99', new Date('2026-05-10T12:00:00Z'));
    expect(sameDay).toEqual({ orphan_count: 0 });

    // now = May 15 → fixture is a past date → counted
    const laterSameMonth = await runOrphanScan(
      logsDir,
      'current99',
      new Date('2026-05-15T12:00:00Z'),
    );
    expect(laterSameMonth).toEqual({ orphan_count: 1 });

    // now = June 5 → fixture is in previous month → still counted
    const nextMonth = await runOrphanScan(logsDir, 'current99', new Date('2026-06-05T12:00:00Z'));
    expect(nextMonth).toEqual({ orphan_count: 1 });
  });
});
