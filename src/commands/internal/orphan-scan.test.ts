import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runOrphanScan } from './orphan-scan.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'onebrain-os-test-'));
}

/**
 * Build a checkpoint filename: YYYY-MM-DD-{token}-checkpoint-{NN}.md
 */
function checkpointName(date: string, token: string, nn: number): string {
  return `${date}-${token}-checkpoint-${String(nn).padStart(2, '0')}.md`;
}

/**
 * Build a session log filename: YYYY-MM-DD-session-{NN}.md
 */
function sessionLogName(date: string, nn: number): string {
  return `${date}-session-${String(nn).padStart(2, '0')}.md`;
}

function checkpointFrontmatter(merged: boolean): string {
  return `---\ntags: [checkpoint, session-log]\ndate: ${new Date().toISOString().slice(0, 10)}\ncheckpoint: 01\ntrigger: stop\nmerged: ${merged}\n---\n\n## What We Worked On\n\nTest content.`;
}

function sessionLogFrontmatter(autoSaved: boolean): string {
  return `---\ntags: [session-log]\ndate: 2026-04-20\nauto-saved: ${autoSaved}\n---\n\n## Session\n\nTest.`;
}

/**
 * Get current and previous month dirs as { thisYear, thisMonth, prevYear, prevMonth }
 */
function getMonthParts() {
  const now = new Date();
  const thisYear = String(now.getFullYear());
  const thisMonth = String(now.getMonth() + 1).padStart(2, '0');
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYear = String(prevDate.getFullYear());
  const prevMonth = String(prevDate.getMonth() + 1).padStart(2, '0');
  return { thisYear, thisMonth, prevYear, prevMonth };
}

async function makeMonthDir(logsDir: string, year: string, month: string): Promise<string> {
  const dir = join(logsDir, year, month);
  await mkdir(dir, { recursive: true });
  return dir;
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
    const result = await runOrphanScan(logsDir, 'abc12345');
    expect(result).toEqual({ orphan_count: 0 });
  });

  // Update snapshots: bun test --update-snapshots
  it('output shape matches snapshot { orphan_count: N }', async () => {
    // Zero orphans — verifies the shape is { orphan_count: 0 }
    const zeroResult = await runOrphanScan(logsDir, 'abc12345');
    expect(zeroResult).toMatchSnapshot();

    // One orphan — verifies the shape is { orphan_count: 1 }
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const pastDate = `${thisYear}-${thisMonth}-01`;
    await writeFile(
      join(monthDir, `${pastDate}-snaptoken-checkpoint-01.md`),
      '---\ntags: [checkpoint]\nmerged: false\n---\n\nContent.',
      'utf8',
    );
    const oneResult = await runOrphanScan(logsDir, 'differenttoken');
    expect(oneResult).toMatchSnapshot();
  });

  it('returns orphan_count: 0 when logs folder does not exist', async () => {
    const result = await runOrphanScan(join(tmpDir, 'nonexistent'), 'abc12345');
    expect(result).toEqual({ orphan_count: 0 });
  });

  // Since v2.2.0, /wrapup deletes checkpoints directly after the session log
  // is verified — any checkpoint file that still exists is unmerged by
  // definition. Legacy `merged: true` files (and the `merged: "true"` quoted
  // variant) are now treated identically to unmerged files, so the only thing
  // that suppresses an orphan is a manual session log for that date or the
  // current session token match.
  it('counts legacy checkpoint with merged: true as an orphan', async () => {
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const pastDate = `${thisYear}-${thisMonth}-01`;
    const fname = checkpointName(pastDate, 'token11', 1);
    await writeFile(join(monthDir, fname), checkpointFrontmatter(true), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99');
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('counts legacy checkpoint with merged: "true" (quoted string) as an orphan', async () => {
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const pastDate = `${thisYear}-${thisMonth}-01`;
    const fname = checkpointName(pastDate, 'tokenStrTrue', 1);
    const content = `---\ntags: [checkpoint, session-log]\ndate: ${pastDate}\ncheckpoint: 01\ntrigger: stop\nmerged: "true"\n---\n\n## What We Worked On\n\nTest content.`;
    await writeFile(join(monthDir, fname), content, 'utf8');
    const result = await runOrphanScan(logsDir, 'current99');
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('skips checkpoint files matching current session token', async () => {
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const pastDate = `${thisYear}-${thisMonth}-01`;
    const fname = checkpointName(pastDate, 'current99', 1);
    await writeFile(join(monthDir, fname), checkpointFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99');
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('skips checkpoint when a manual (non-auto-saved) session log exists for that date', async () => {
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const pastDate = `${thisYear}-${thisMonth}-02`;
    // Write checkpoint (unmerged)
    const cpName = checkpointName(pastDate, 'tokenAA', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    // Write manual session log (auto-saved: false)
    const logName = sessionLogName(pastDate, 1);
    await writeFile(join(monthDir, logName), sessionLogFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99');
    expect(result).toEqual({ orphan_count: 0 });
  });

  it('does NOT skip when only auto-saved session log exists for that date', async () => {
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const pastDate = `${thisYear}-${thisMonth}-03`;
    // Write checkpoint (unmerged)
    const cpName = checkpointName(pastDate, 'tokenBB', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    // Write auto-saved session log
    const logName = sessionLogName(pastDate, 1);
    await writeFile(join(monthDir, logName), sessionLogFrontmatter(true), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99');
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('counts unmerged orphan checkpoints from current month', async () => {
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const pastDate = `${thisYear}-${thisMonth}-04`;
    // Two different tokens
    for (const token of ['tokenCC', 'tokenDD']) {
      const cpName = checkpointName(pastDate, token, 1);
      await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    }
    const result = await runOrphanScan(logsDir, 'current99');
    expect(result).toEqual({ orphan_count: 2 });
  });

  it('counts orphans from previous month dir', async () => {
    const { prevYear, prevMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, prevYear, prevMonth);
    const pastDate = `${prevYear}-${prevMonth}-15`;
    const cpName = checkpointName(pastDate, 'tokenEE', 1);
    await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99');
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('multiple checkpoints for same token in same month count as one orphan session', async () => {
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const pastDate = `${thisYear}-${thisMonth}-05`;
    // Same token, two checkpoint files
    for (let i = 1; i <= 2; i++) {
      const cpName = checkpointName(pastDate, 'tokenFF', i);
      await writeFile(join(monthDir, cpName), checkpointFrontmatter(false), 'utf8');
    }
    const result = await runOrphanScan(logsDir, 'current99');
    // One token = one orphan session
    expect(result).toEqual({ orphan_count: 1 });
  });

  it('handles files with missing frontmatter gracefully (counts as orphan)', async () => {
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const pastDate = `${thisYear}-${thisMonth}-06`;
    const cpName = checkpointName(pastDate, 'tokenGG', 1);
    await writeFile(join(monthDir, cpName), '# No frontmatter here\n\nContent.', 'utf8');
    const result = await runOrphanScan(logsDir, 'current99');
    expect(result).toEqual({ orphan_count: 1 });
  });

  it("creates a checkpoint file with today's actual date → orphan_count: 0 (today boundary skipped)", async () => {
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const todayStr = `${thisYear}-${thisMonth}-${String(new Date().getDate()).padStart(2, '0')}`;
    const fname = checkpointName(todayStr, 'todaytoken', 1);
    await writeFile(join(monthDir, fname), checkpointFrontmatter(false), 'utf8');
    const result = await runOrphanScan(logsDir, 'current99');
    // Today's checkpoints must be skipped — not orphans yet
    expect(result).toEqual({ orphan_count: 0 });
  });

  it("today's file skipped but a past date in same month still counted", async () => {
    const { thisYear, thisMonth } = getMonthParts();
    const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const todayStr = `${thisYear}-${thisMonth}-${String(new Date().getDate()).padStart(2, '0')}`;
    // Today: should be skipped
    const todayFname = checkpointName(todayStr, 'todaytoken', 1);
    await writeFile(join(monthDir, todayFname), checkpointFrontmatter(false), 'utf8');

    // Past date in same month: day 01 (safe to use if today isn't day 01)
    const todayDay = new Date().getDate();
    if (todayDay !== 1) {
      const pastDate = `${thisYear}-${thisMonth}-01`;
      const pastFname = checkpointName(pastDate, 'pasttoken', 1);
      await writeFile(join(monthDir, pastFname), checkpointFrontmatter(false), 'utf8');

      const result = await runOrphanScan(logsDir, 'current99');
      // today skipped, past counted
      expect(result).toEqual({ orphan_count: 1 });
    } else {
      // If today IS day 01, just verify today is skipped
      const result = await runOrphanScan(logsDir, 'current99');
      expect(result).toEqual({ orphan_count: 0 });
    }
  });

  it('combines orphans from both months in total count', async () => {
    const { thisYear, thisMonth, prevYear, prevMonth } = getMonthParts();

    const thisMonthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
    const prevMonthDir = await makeMonthDir(logsDir, prevYear, prevMonth);

    const thisDate = `${thisYear}-${thisMonth}-07`;
    const prevDate = `${prevYear}-${prevMonth}-20`;

    await writeFile(
      join(thisMonthDir, checkpointName(thisDate, 'tokenHH', 1)),
      checkpointFrontmatter(false),
      'utf8',
    );
    await writeFile(
      join(prevMonthDir, checkpointName(prevDate, 'tokenII', 1)),
      checkpointFrontmatter(false),
      'utf8',
    );

    const result = await runOrphanScan(logsDir, 'current99');
    expect(result).toEqual({ orphan_count: 2 });
  });
});
