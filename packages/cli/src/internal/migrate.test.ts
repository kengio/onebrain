import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runBackfillRecapped } from './migrate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'onebrain-test-migrate-'));
}

/**
 * Make a month directory under logs folder
 */
async function makeMonthDir(logsDir: string, year: string, month: string): Promise<string> {
	const dir = join(logsDir, year, month);
	await mkdir(dir, { recursive: true });
	return dir;
}

/**
 * Create a session log file with optional frontmatter
 */
async function writeSessionLog(
	dir: string,
	filename: string,
	frontmatter?: Record<string, unknown>,
): Promise<void> {
	let content = '';
	if (frontmatter) {
		content += '---\n';
		for (const [key, value] of Object.entries(frontmatter)) {
			if (typeof value === 'string') {
				content += `${key}: ${value}\n`;
			} else if (typeof value === 'boolean') {
				content += `${key}: ${value}\n`;
			} else {
				content += `${key}: ${JSON.stringify(value)}\n`;
			}
		}
		content += '---\n';
	}
	content += '\n## Session\n\nTest content\n';

	await writeFile(join(dir, filename), content);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runBackfillRecapped', () => {
	let tmpDir: string;
	let logsDir: string;
	const today = new Date().toISOString().slice(0, 10);

	beforeEach(async () => {
		tmpDir = await makeTmpDir();
		logsDir = join(tmpDir, '07-logs');
		await mkdir(logsDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it('returns backfilled: 0, skipped: 0 for empty logs dir', async () => {
		const result = await runBackfillRecapped(logsDir);
		expect(result).toEqual({ backfilled: 0, skipped: 0 });
	});

	it('returns backfilled: 0, skipped: 0 when logs dir does not exist', async () => {
		const nonexistent = join(tmpDir, 'nonexistent');
		const result = await runBackfillRecapped(nonexistent);
		expect(result).toEqual({ backfilled: 0, skipped: 0 });
	});

	it('skips checkpoint files (filename contains -checkpoint-)', async () => {
		const monthDir = await makeMonthDir(logsDir, '2026', '04');
		await writeSessionLog(monthDir, '2026-04-20-abc12345-checkpoint-01.md', {
			tags: 'checkpoint',
			checkpoint: '01',
			recapped: false,
		});

		const result = await runBackfillRecapped(logsDir);
		expect(result).toEqual({ backfilled: 0, skipped: 0 });
	});

	it('skips files that already have recapped field', async () => {
		const monthDir = await makeMonthDir(logsDir, '2026', '04');
		await writeSessionLog(monthDir, '2026-04-20-session-01.md', {
			tags: 'session-log',
			recapped: '2026-04-20',
		});

		const result = await runBackfillRecapped(logsDir);
		expect(result).toEqual({ backfilled: 0, skipped: 0 });
	});

	it('adds recapped field to session log missing it', async () => {
		const monthDir = await makeMonthDir(logsDir, '2026', '04');
		await writeSessionLog(monthDir, '2026-04-20-session-01.md', {
			tags: 'session-log',
			date: '2026-04-20',
		});

		const result = await runBackfillRecapped(logsDir);
		expect(result).toEqual({ backfilled: 1, skipped: 0 });

		// Verify file was updated
		const content = await Bun.file(join(monthDir, '2026-04-20-session-01.md')).text();
		expect(content).toContain(`recapped: ${today}`);
	});

	it('skips files with malformed frontmatter', async () => {
		const monthDir = await makeMonthDir(logsDir, '2026', '04');
		// Missing closing ---
		await writeFile(
			join(monthDir, '2026-04-20-session-01.md'),
			'---\ntags: session-log\ndate: 2026-04-20\n\n## Session\nContent\n',
		);

		const result = await runBackfillRecapped(logsDir);
		expect(result.skipped).toBeGreaterThan(0);
	});

	it('processes multiple files in multiple months', async () => {
		const monthDir1 = await makeMonthDir(logsDir, '2026', '04');
		const monthDir2 = await makeMonthDir(logsDir, '2026', '03');

		// File in April without recapped
		await writeSessionLog(monthDir1, '2026-04-20-session-01.md', {
			tags: 'session-log',
			date: '2026-04-20',
		});

		// File in March without recapped
		await writeSessionLog(monthDir2, '2026-03-15-session-01.md', {
			tags: 'session-log',
			date: '2026-03-15',
		});

		// File that already has recapped
		await writeSessionLog(monthDir1, '2026-04-19-session-01.md', {
			tags: 'session-log',
			date: '2026-04-19',
			recapped: '2026-04-19',
		});

		const result = await runBackfillRecapped(logsDir);
		expect(result).toEqual({ backfilled: 2, skipped: 0 });
	});

	it('skips files without frontmatter', async () => {
		const monthDir = await makeMonthDir(logsDir, '2026', '04');
		// File with no frontmatter
		await writeFile(join(monthDir, '2026-04-20-session-01.md'), '## Session\n\nContent\n');

		const result = await runBackfillRecapped(logsDir);
		expect(result).toEqual({ backfilled: 0, skipped: 1 });
	});

	it('preserves existing frontmatter fields when adding recapped', async () => {
		const monthDir = await makeMonthDir(logsDir, '2026', '04');
		await writeSessionLog(monthDir, '2026-04-20-session-01.md', {
			tags: 'session-log',
			date: '2026-04-20',
			foo: 'bar',
		});

		const result = await runBackfillRecapped(logsDir);
		expect(result).toEqual({ backfilled: 1, skipped: 0 });

		// Verify all fields are preserved
		const content = await Bun.file(join(monthDir, '2026-04-20-session-01.md')).text();
		expect(content).toContain('tags: session-log');
		expect(content).toContain('date: 2026-04-20');
		expect(content).toContain('foo: bar');
		expect(content).toContain(`recapped: ${today}`);
	});

	it('handles idempotent re-runs: only first run backfills', async () => {
		const monthDir = await makeMonthDir(logsDir, '2026', '04');
		await writeSessionLog(monthDir, '2026-04-20-session-01.md', {
			tags: 'session-log',
			date: '2026-04-20',
		});

		// First run
		const result1 = await runBackfillRecapped(logsDir);
		expect(result1).toEqual({ backfilled: 1, skipped: 0 });

		// Second run — should skip since recapped now exists
		const result2 = await runBackfillRecapped(logsDir);
		expect(result2).toEqual({ backfilled: 0, skipped: 0 });
	});
});
