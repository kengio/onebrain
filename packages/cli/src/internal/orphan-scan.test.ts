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

	it('returns orphan_count: 0 when logs folder does not exist', async () => {
		const result = await runOrphanScan(join(tmpDir, 'nonexistent'), 'abc12345');
		expect(result).toEqual({ orphan_count: 0 });
	});

	it('skips checkpoint files with merged: true', async () => {
		const { thisYear, thisMonth } = getMonthParts();
		const monthDir = await makeMonthDir(logsDir, thisYear, thisMonth);
		// Use a past date so today-skip doesn't apply
		const pastDate = `${thisYear}-${thisMonth}-01`;
		const fname = checkpointName(pastDate, 'token11', 1);
		await writeFile(join(monthDir, fname), checkpointFrontmatter(true), 'utf8');
		const result = await runOrphanScan(logsDir, 'current99');
		expect(result).toEqual({ orphan_count: 0 });
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
