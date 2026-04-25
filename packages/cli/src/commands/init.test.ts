/**
 * Integration tests for `onebrain init`
 *
 * Tests run against a temp vault dir. Process TTY is always false in test
 * (piped stdout), so all non-TTY paths are exercised directly.
 *
 * Vault-sync and register-hooks are mocked so tests stay offline and fast.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type InitOptions, runInit } from './init.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempVault(): Promise<string> {
	const dir = join(
		tmpdir(),
		`onebrain-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(dir, { recursive: true });
	return dir;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function readVaultYml(vaultDir: string): Promise<Record<string, unknown>> {
	const { parse } = await import('yaml');
	const text = await readFile(join(vaultDir, 'vault.yml'), 'utf8');
	return (parse(text) ?? {}) as Record<string, unknown>;
}

// Noop mocks — capture calls but do nothing
const noopVaultSync = async (_vaultDir: string, _opts: Record<string, unknown>) => {
	// no-op
};

const noopRegisterHooks = async (_vaultDir: string) => {
	// no-op
};

let tempDir: string;

beforeEach(async () => {
	tempDir = await makeTempVault();
});

afterEach(async () => {
	await rm(tempDir, { recursive: true, force: true });
	process.env.CLAUDE_CODE_HARNESS = undefined;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runInit', () => {
	it('fresh vault — creates all standard folders + vault.yml + calls vault-sync', async () => {
		let vaultSyncCalled = false;
		const mockVaultSync = async (_vaultDir: string, _opts: Record<string, unknown>) => {
			vaultSyncCalled = true;
		};

		const opts: InitOptions = {
			vaultDir: tempDir,
			vaultSyncFn: mockVaultSync,
			registerHooksFn: noopRegisterHooks,
		};

		const result = await runInit(opts);

		expect(result.ok).toBe(true);

		// All 8 standard folders should exist
		const folders = [
			'00-inbox',
			'01-projects',
			'02-areas',
			'03-knowledge',
			'04-resources',
			'05-agent',
			'06-archive',
			'07-logs',
		];
		for (const folder of folders) {
			expect(await fileExists(join(tempDir, folder))).toBe(true);
		}

		// imports subdirectory inside inbox
		expect(await fileExists(join(tempDir, '00-inbox', 'imports'))).toBe(true);

		// vault.yml written
		expect(await fileExists(join(tempDir, 'vault.yml'))).toBe(true);
		const vaultYml = await readVaultYml(tempDir);
		expect(vaultYml.method).toBe('onebrain');
		expect(vaultYml.update_channel).toBe('stable');

		// folders count: 8 standard + inbox/imports = 9 total
		expect(result.foldersCreated).toBe(9);

		// vault-sync was called (plugin files not present)
		expect(vaultSyncCalled).toBe(true);
	});

	it('existing vault.yml in non-TTY → exit 1 with message', async () => {
		await writeFile(join(tempDir, 'vault.yml'), 'method: onebrain\n', 'utf8');

		const opts: InitOptions = {
			vaultDir: tempDir,
			isTTY: false,
			vaultSyncFn: noopVaultSync,
			registerHooksFn: noopRegisterHooks,
		};

		const result = await runInit(opts);

		expect(result.ok).toBe(false);
		expect(result.exitCode).toBe(1);
		expect(result.message).toContain('vault.yml exists');
		expect(result.message).toContain('--force');
	});

	it('--force overwrites existing vault.yml', async () => {
		await writeFile(join(tempDir, 'vault.yml'), 'method: legacy\n', 'utf8');

		const opts: InitOptions = {
			vaultDir: tempDir,
			force: true,
			vaultSyncFn: noopVaultSync,
			registerHooksFn: noopRegisterHooks,
		};

		const result = await runInit(opts);

		expect(result.ok).toBe(true);
		const vaultYml = await readVaultYml(tempDir);
		expect(vaultYml.method).toBe('onebrain');
	});

	it('plugin files already present — skips vault-sync download', async () => {
		// Pre-create plugin.json to simulate existing plugin files
		const pluginMetaDir = join(tempDir, '.claude', 'plugins', 'onebrain', '.claude-plugin');
		await mkdir(pluginMetaDir, { recursive: true });
		await writeFile(
			join(pluginMetaDir, 'plugin.json'),
			JSON.stringify({ version: '1.11.0' }),
			'utf8',
		);

		let vaultSyncCalled = false;
		const mockVaultSync = async (_vaultDir: string, _opts: Record<string, unknown>) => {
			vaultSyncCalled = true;
		};

		const opts: InitOptions = {
			vaultDir: tempDir,
			vaultSyncFn: mockVaultSync,
			registerHooksFn: noopRegisterHooks,
		};

		const result = await runInit(opts);

		expect(result.ok).toBe(true);
		expect(vaultSyncCalled).toBe(false);
		expect(result.pluginSkipped).toBe(true);
	});

	it('source:marketplace in installed_plugins.json — skips plugin registration', async () => {
		// Create installed_plugins.json with marketplace entry
		const pluginsDir = join(tempDir, '.claude-meta');
		await mkdir(pluginsDir, { recursive: true });
		const installedPluginsPath = join(pluginsDir, 'installed_plugins.json');
		await writeFile(
			installedPluginsPath,
			JSON.stringify({
				plugins: {
					'onebrain@1.0.0': [{ source: 'marketplace', installPath: '/some/path' }],
				},
			}),
			'utf8',
		);

		const opts: InitOptions = {
			vaultDir: tempDir,
			vaultSyncFn: noopVaultSync,
			registerHooksFn: noopRegisterHooks,
			installedPluginsPath,
		};

		const result = await runInit(opts);

		expect(result.ok).toBe(true);
		expect(result.pluginRegistrationSkipped).toBe(true);
	});

	it('harness auto-detect: .claude/ dir present → claude-code', async () => {
		await mkdir(join(tempDir, '.claude'), { recursive: true });

		const opts: InitOptions = {
			vaultDir: tempDir,
			vaultSyncFn: noopVaultSync,
			registerHooksFn: noopRegisterHooks,
		};

		const result = await runInit(opts);

		expect(result.ok).toBe(true);
		const vaultYml = await readVaultYml(tempDir);
		const runtime = vaultYml.runtime as Record<string, unknown> | undefined;
		expect(runtime?.harness).toBe('claude-code');
	});

	it('harness auto-detect: no .claude/ dir → direct', async () => {
		// Fresh vault, no .claude/ dir
		const opts: InitOptions = {
			vaultDir: tempDir,
			vaultSyncFn: noopVaultSync,
			registerHooksFn: noopRegisterHooks,
		};

		const result = await runInit(opts);

		expect(result.ok).toBe(true);
		const vaultYml = await readVaultYml(tempDir);
		const runtime = vaultYml.runtime as Record<string, unknown> | undefined;
		expect(runtime?.harness).toBe('direct');
	});

	it('--harness flag overrides auto-detect', async () => {
		const opts: InitOptions = {
			vaultDir: tempDir,
			harness: 'gemini',
			vaultSyncFn: noopVaultSync,
			registerHooksFn: noopRegisterHooks,
		};

		const result = await runInit(opts);

		expect(result.ok).toBe(true);
		const vaultYml = await readVaultYml(tempDir);
		const runtime = vaultYml.runtime as Record<string, unknown> | undefined;
		expect(runtime?.harness).toBe('gemini');
	});

	it('existing folders not double-counted in foldersCreated', async () => {
		// Pre-create some folders
		await mkdir(join(tempDir, '00-inbox'), { recursive: true });
		await mkdir(join(tempDir, '01-projects'), { recursive: true });

		const opts: InitOptions = {
			vaultDir: tempDir,
			vaultSyncFn: noopVaultSync,
			registerHooksFn: noopRegisterHooks,
		};

		const result = await runInit(opts);

		expect(result.ok).toBe(true);
		// 9 total (8 standard + imports), 2 already exist → 7 created
		expect(result.foldersCreated).toBe(7);
	});

	it('non-TTY output starts with OneBrain Init header', async () => {
		const lines: string[] = [];
		const originalWrite = process.stdout.write.bind(process.stdout);
		process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
			if (typeof chunk === 'string') lines.push(chunk);
			return originalWrite(chunk, ...(args as Parameters<typeof originalWrite>).slice(1));
		};

		try {
			const opts: InitOptions = {
				vaultDir: tempDir,
				isTTY: false,
				vaultSyncFn: noopVaultSync,
				registerHooksFn: noopRegisterHooks,
			};
			const result = await runInit(opts);
			expect(result.ok).toBe(true);
		} finally {
			process.stdout.write = originalWrite;
		}

		const fullOutput = lines.join('');
		expect(fullOutput).toMatch(/^OneBrain Init\n/);
	});

	it('harness auto-detect: CLAUDE_CODE_HARNESS env → uses env value', async () => {
		process.env.CLAUDE_CODE_HARNESS = 'gemini';

		const opts: InitOptions = {
			vaultDir: tempDir,
			vaultSyncFn: noopVaultSync,
			registerHooksFn: noopRegisterHooks,
		};

		const result = await runInit(opts);

		expect(result.ok).toBe(true);
		expect(result.harness).toBe('gemini');
		const vaultYml = await readVaultYml(tempDir);
		const runtime = vaultYml.runtime as Record<string, unknown> | undefined;
		expect(runtime?.harness).toBe('gemini');
	});
});
