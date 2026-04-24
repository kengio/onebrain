/**
 * vault-sync integration tests (TDD)
 *
 * Uses a mock GitHub tarball — does NOT hit real GitHub.
 * Verifies all 7 steps with a temp vault dir.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type VaultSyncOptions, runVaultSync } from './vault-sync.js';

// ---------------------------------------------------------------------------
// Tarball builder helpers (uses tar CLI — available on macOS/Linux)
// ---------------------------------------------------------------------------

interface TarballOpts {
	prefix?: string;
	pluginVersion?: string;
	extraPluginFiles?: Record<string, string>;
	claudeMdContent?: string;
	geminiMdContent?: string;
	agentsMdContent?: string;
}

/**
 * Build a minimal fake tarball (.tar.gz) using the tar CLI.
 * Layout mirrors a real GitHub archive:
 *   kengio-onebrain-<sha>/
 *     .claude/plugins/onebrain/plugin.json
 *     .claude/plugins/onebrain/INSTRUCTIONS.md
 *     .claude/plugins/onebrain/skills/example/SKILL.md
 *     README.md  CONTRIBUTING.md  CHANGELOG.md
 *     CLAUDE.md  GEMINI.md  AGENTS.md
 */
function buildMockTarball(opts: TarballOpts = {}): Buffer {
	const prefix = opts.prefix ?? 'kengio-onebrain-abc1234';
	const version = opts.pluginVersion ?? '1.11.0';

	const files: Record<string, string> = {
		[`${prefix}/.claude/plugins/onebrain/plugin.json`]: JSON.stringify({
			id: 'onebrain',
			version,
			name: 'OneBrain',
		}),
		[`${prefix}/.claude/plugins/onebrain/INSTRUCTIONS.md`]: '# OneBrain Instructions\n',
		[`${prefix}/.claude/plugins/onebrain/skills/example/SKILL.md`]: '# Example Skill\n',
		[`${prefix}/README.md`]: '# OneBrain\n',
		[`${prefix}/CONTRIBUTING.md`]: '# Contributing\n',
		[`${prefix}/CHANGELOG.md`]: '# Changelog\n',
		[`${prefix}/CLAUDE.md`]: opts.claudeMdContent ?? '@.claude/plugins/onebrain/INSTRUCTIONS.md\n',
		[`${prefix}/GEMINI.md`]: opts.geminiMdContent ?? '@.claude/plugins/onebrain/INSTRUCTIONS.md\n',
		[`${prefix}/AGENTS.md`]: opts.agentsMdContent ?? '@.claude/plugins/onebrain/INSTRUCTIONS.md\n',
		...Object.fromEntries(
			Object.entries(opts.extraPluginFiles ?? {}).map(([k, v]) => [
				`${prefix}/.claude/plugins/onebrain/${k}`,
				v,
			]),
		),
	};

	// Write files to a temp staging directory
	const stageDir = `${require('node:os').tmpdir()}/onebrain-stage-${process.pid}`;
	require('node:fs').mkdirSync(stageDir, { recursive: true });

	for (const [relPath, content] of Object.entries(files)) {
		const fullPath = join(stageDir, relPath);
		mkdirSync(join(fullPath, '..'), { recursive: true });
		writeFileSync(fullPath, content, 'utf8');
	}

	const tarPath = join(stageDir, 'bundle.tar.gz');
	const r = spawnSync('tar', ['-czf', tarPath, '-C', stageDir, prefix], { encoding: 'utf8' });
	if (r.status !== 0) {
		throw new Error(`tar failed: ${r.stderr}`);
	}

	const buf = require('node:fs').readFileSync(tarPath);
	require('node:fs').rmSync(stageDir, { recursive: true, force: true });
	return buf as Buffer;
}

/**
 * Create a mock fetch that returns the tarball buffer as a Response.
 */
function mockFetchWithTarball(tarball: Buffer): VaultSyncOptions['fetchFn'] {
	return async (_url: string | URL | Request) => {
		return new Response(tarball, {
			status: 200,
			headers: { 'content-type': 'application/x-gzip' },
		});
	};
}

// ---------------------------------------------------------------------------
// Test vault setup
// ---------------------------------------------------------------------------

async function makeVaultDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'onebrain-vs-test-'));
}

const VALID_VAULT_YML =
	'method: onebrain\nupdate_channel: stable\nfolders:\n  inbox: 00-inbox\n  logs: 07-logs\n';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runVaultSync', () => {
	let vaultDir: string;
	let tarball: Buffer;

	beforeEach(async () => {
		vaultDir = await makeVaultDir();
		await writeFile(join(vaultDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
		tarball = buildMockTarball({});
	});

	afterEach(async () => {
		await rm(vaultDir, { recursive: true, force: true });
	});

	// ── Test 1: fresh sync ─────────────────────────────────────────────────

	it('fresh sync: syncs all plugin files and root docs', async () => {
		const result = await runVaultSync(vaultDir, {
			fetchFn: mockFetchWithTarball(tarball),
		});

		expect(result.ok).toBe(true);
		expect(result.filesAdded).toBeGreaterThan(0);
		expect(result.filesRemoved).toBe(0);

		// plugin.json should be present
		const pluginJson = join(vaultDir, '.claude/plugins/onebrain/plugin.json');
		const pj = JSON.parse(await readFile(pluginJson, 'utf8'));
		expect(pj.version).toBe('1.11.0');

		// Root docs should be present
		const readme = await readFile(join(vaultDir, 'README.md'), 'utf8');
		expect(readme).toContain('# OneBrain');

		// vault.yml should have onebrain_version
		const vaultYml = await readFile(join(vaultDir, 'vault.yml'), 'utf8');
		expect(vaultYml).toContain('onebrain_version: 1.11.0');
	});

	// ── Test 2: stale file removal ──────────────────────────────────────────

	it('sync with stale files: removes files not in tarball', async () => {
		// Pre-populate vault plugin dir with a stale file not in tarball
		const pluginDir = join(vaultDir, '.claude/plugins/onebrain');
		await mkdir(pluginDir, { recursive: true });
		await writeFile(join(pluginDir, 'stale-file.md'), '# Stale\n', 'utf8');

		const result = await runVaultSync(vaultDir, {
			fetchFn: mockFetchWithTarball(tarball),
		});

		expect(result.ok).toBe(true);
		expect(result.filesRemoved).toBeGreaterThanOrEqual(1);

		// stale file should be gone
		let staleExists = false;
		try {
			await stat(join(pluginDir, 'stale-file.md'));
			staleExists = true;
		} catch {
			staleExists = false;
		}
		expect(staleExists).toBe(false);
	});

	// ── Test 3: marketplace pin skip ────────────────────────────────────────

	it('source: marketplace → pin step is skipped', async () => {
		const pluginsDir = join(vaultDir, '.fake-claude-plugins');
		await mkdir(pluginsDir, { recursive: true });
		const installedJson = {
			plugins: {
				'onebrain@marketplace': [
					{
						id: 'onebrain',
						source: 'marketplace',
						installPath: join(pluginsDir, 'cache/marketplace/onebrain/1.10.0'),
					},
				],
			},
		};
		const installedPath = join(pluginsDir, 'installed_plugins.json');
		await writeFile(installedPath, JSON.stringify(installedJson, null, 2), 'utf8');

		const result = await runVaultSync(vaultDir, {
			fetchFn: mockFetchWithTarball(tarball),
			installedPluginsPath: installedPath,
		});

		expect(result.ok).toBe(true);
		expect(result.pinSkipped).toBe(true);

		// installed_plugins.json installPath must NOT be rewritten
		const afterJson = JSON.parse(await readFile(installedPath, 'utf8'));
		const entry = afterJson.plugins['onebrain@marketplace'][0];
		expect(entry.installPath).toContain('cache/marketplace/onebrain/1.10.0');
	});

	// ── Test 4: harness file import injection ───────────────────────────────

	it('injects new @import lines not already in vault harness file', async () => {
		// Vault CLAUDE.md has existing import + custom content
		await writeFile(
			join(vaultDir, 'CLAUDE.md'),
			'# My Config\n\n@.claude/plugins/onebrain/INSTRUCTIONS.md\n',
			'utf8',
		);

		const tarballWithNewImport = buildMockTarball({
			claudeMdContent:
				'@.claude/plugins/onebrain/INSTRUCTIONS.md\n@.claude/plugins/onebrain/NEW.md\n',
		});

		const result = await runVaultSync(vaultDir, {
			fetchFn: mockFetchWithTarball(tarballWithNewImport),
		});

		expect(result.ok).toBe(true);

		const claude = await readFile(join(vaultDir, 'CLAUDE.md'), 'utf8');
		// New import added
		expect(claude).toContain('@.claude/plugins/onebrain/NEW.md');
		// Original vault content preserved
		expect(claude).toContain('# My Config');
		// No duplicate of the existing import
		const matches = claude.match(/@\.claude\/plugins\/onebrain\/INSTRUCTIONS\.md/g);
		expect(matches?.length).toBe(1);

		expect(result.importsAdded).toBeGreaterThan(0);
	});

	// ── Test 5: no duplicate imports injected ──────────────────────────────

	it('does not inject @import lines already in vault', async () => {
		// Pre-create all three harness files so no file triggers the "created fresh" path
		const existingImport = '@.claude/plugins/onebrain/INSTRUCTIONS.md\n';
		await writeFile(join(vaultDir, 'CLAUDE.md'), existingImport, 'utf8');
		await writeFile(join(vaultDir, 'GEMINI.md'), existingImport, 'utf8');
		await writeFile(join(vaultDir, 'AGENTS.md'), existingImport, 'utf8');

		const tarballSameImport = buildMockTarball({
			claudeMdContent: existingImport,
			geminiMdContent: existingImport,
			agentsMdContent: existingImport,
		});

		const result = await runVaultSync(vaultDir, {
			fetchFn: mockFetchWithTarball(tarballSameImport),
		});

		expect(result.ok).toBe(true);

		const claude = await readFile(join(vaultDir, 'CLAUDE.md'), 'utf8');
		const matches = claude.match(/@\.claude\/plugins\/onebrain\/INSTRUCTIONS\.md/g);
		expect(matches?.length).toBe(1);
		// All three harness files had identical imports — nothing new to inject
		expect(result.importsAdded).toBe(0);
	});

	// ── Test 6: vault.yml version + channel written ─────────────────────────

	it('writes onebrain_version and preserves update_channel in vault.yml', async () => {
		const result = await runVaultSync(vaultDir, {
			fetchFn: mockFetchWithTarball(tarball),
		});

		expect(result.ok).toBe(true);

		const vaultYml = await readFile(join(vaultDir, 'vault.yml'), 'utf8');
		expect(vaultYml).toContain('onebrain_version: 1.11.0');
		expect(vaultYml).toContain('update_channel: stable');
	});

	// ── Test 7: missing installed_plugins.json → pin no-op ─────────────────

	it('pin step is no-op when installed_plugins.json does not exist', async () => {
		const result = await runVaultSync(vaultDir, {
			fetchFn: mockFetchWithTarball(tarball),
			installedPluginsPath: join(vaultDir, 'nonexistent-installed_plugins.json'),
		});

		expect(result.ok).toBe(true);
		expect(result.pinSkipped).toBe(true);
	});

	// ── Test 8: pin updates installPath when not marketplace ───────────────

	it('pin updates installPath for non-marketplace entry inside cache dir', async () => {
		const pluginsDir = join(vaultDir, '.fake-claude-plugins');
		const cacheDir = join(pluginsDir, 'cache');
		const entryPath = join(cacheDir, 'onebrain-local', 'onebrain', '1.10.0');
		await mkdir(entryPath, { recursive: true });

		const installedJson = {
			plugins: {
				'onebrain@onebrain-local': [
					{
						id: 'onebrain',
						source: 'local',
						installPath: entryPath,
					},
				],
			},
		};
		const installedPath = join(pluginsDir, 'installed_plugins.json');
		await writeFile(installedPath, JSON.stringify(installedJson, null, 2), 'utf8');

		const result = await runVaultSync(vaultDir, {
			fetchFn: mockFetchWithTarball(tarball),
			installedPluginsPath: installedPath,
			installedPluginsCacheDir: cacheDir,
		});

		expect(result.ok).toBe(true);
		expect(result.pinSkipped).toBe(false);

		const afterJson = JSON.parse(await readFile(installedPath, 'utf8'));
		const entry = afterJson.plugins['onebrain@onebrain-local'][0];
		expect(entry.installPath).toBe(join(vaultDir, '.claude/plugins/onebrain'));
	});

	// ── Test 9: steps 6–7 errors are non-fatal ─────────────────────────────

	it('pin/cache errors are non-fatal — result.ok remains true', async () => {
		// vault.yml is valid YAML but not valid JSON → will cause JSON parse error in pin step
		const result = await runVaultSync(vaultDir, {
			fetchFn: mockFetchWithTarball(tarball),
			installedPluginsPath: join(vaultDir, 'vault.yml'),
		});

		expect(result.ok).toBe(true);
	});
});
