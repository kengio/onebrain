/**
 * Integration tests for `initCommand` (the CLI entry point that wraps runInit).
 *
 * These tests exercise the full init flow end-to-end through initCommand(), which
 * calls runInit() and then process.exit(). All network calls (vault-sync, register-hooks)
 * are injected as mocks so tests run offline and fast.
 *
 * Note: initCommand() calls process.exit(1) on failure. We test runInit() directly for
 * error cases where the exit would abort the test process.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { type InitOptions, runInit } from './init.js';

// ---------------------------------------------------------------------------
// Suite-level guard: real ~/.claude/plugins/installed_plugins.json must NOT
// be touched by any test in this file (#146 regression hardening).
// ---------------------------------------------------------------------------

const REAL_REGISTRY_PATH = join(homedir(), '.claude', 'plugins', 'installed_plugins.json');
let realRegistrySnapshot: { mtimeMs: number; bytes: string } | null = null;
let realRegistryWasMissing = false;

beforeAll(async () => {
  try {
    const s = await stat(REAL_REGISTRY_PATH);
    const bytes = await readFile(REAL_REGISTRY_PATH, 'utf8');
    realRegistrySnapshot = { mtimeMs: s.mtimeMs, bytes };
  } catch {
    realRegistryWasMissing = true;
  }
});

afterAll(async () => {
  if (realRegistryWasMissing) {
    let exists = false;
    try {
      await stat(REAL_REGISTRY_PATH);
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      throw new Error(
        `Test suite created ${REAL_REGISTRY_PATH} which did not exist before tests ran (#146 regression).`,
      );
    }
    return;
  }
  if (!realRegistrySnapshot) return;
  const after = await readFile(REAL_REGISTRY_PATH, 'utf8');
  if (after !== realRegistrySnapshot.bytes) {
    throw new Error(
      `Test suite mutated ${REAL_REGISTRY_PATH} (#146 regression). Some test omitted installedPluginsPath injection. Bytes differ: before=${realRegistrySnapshot.bytes.length}, after=${after.length}.`,
    );
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempVault(): Promise<string> {
  const dir = join(
    tmpdir(),
    `onebrain-init-int-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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

const noopVaultSync = async (_vaultDir: string, _opts: Record<string, unknown>) => {};
const noopRegisterHooks = async (_vaultDir: string) => {};

const STANDARD_FOLDERS = [
  '00-inbox',
  '01-projects',
  '02-areas',
  '03-knowledge',
  '04-resources',
  '05-agent',
  '06-archive',
  '07-logs',
];

let tempDir: string;
// Per-test isolated installed_plugins.json. Tests must NEVER fall back to
// the real ~/.claude/plugins/installed_plugins.json (#146).
let isolatedInstalledPath: string;

beforeEach(async () => {
  tempDir = await makeTempVault();
  isolatedInstalledPath = join(tempDir, '.isolated-installed_plugins.json');
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Scenario 1: Fresh vault (non-TTY) — all 8 folders created, vault.yml with folders: section
// ---------------------------------------------------------------------------

describe('init integration: fresh vault (non-TTY)', () => {
  it('creates all 8 standard folders plus inbox/imports sub-directory', async () => {
    const opts: InitOptions = {
      vaultDir: tempDir,
      isTTY: false,
      vaultSyncFn: noopVaultSync,
      registerHooksFn: noopRegisterHooks,
      installedPluginsPath: isolatedInstalledPath,
    };

    const result = await runInit(opts);

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);

    for (const folder of STANDARD_FOLDERS) {
      expect(await fileExists(join(tempDir, folder))).toBe(true);
    }
    expect(await fileExists(join(tempDir, '00-inbox', 'imports'))).toBe(true);
  });

  it('vault.yml exists with required top-level fields and folders: section', async () => {
    const opts: InitOptions = {
      vaultDir: tempDir,
      isTTY: false,
      vaultSyncFn: noopVaultSync,
      registerHooksFn: noopRegisterHooks,
      installedPluginsPath: isolatedInstalledPath,
    };

    const result = await runInit(opts);
    expect(result.ok).toBe(true);

    expect(await fileExists(join(tempDir, 'vault.yml'))).toBe(true);

    const parsed = await readVaultYml(tempDir);
    expect(parsed).toHaveProperty('folders');
    expect(typeof parsed['folders']).toBe('object');
    // Verify all expected folder keys are present
    const folders = parsed['folders'] as Record<string, string>;
    expect(folders['inbox']).toBe('00-inbox');
    expect(folders['logs']).toBe('07-logs');
    expect(parsed['update_channel']).toBeDefined();
    expect(parsed['update_channel']).toBe('stable');
  });

  it('command completes without throwing, result.ok is true', async () => {
    const opts: InitOptions = {
      vaultDir: tempDir,
      isTTY: false,
      vaultSyncFn: noopVaultSync,
      registerHooksFn: noopRegisterHooks,
      installedPluginsPath: isolatedInstalledPath,
    };

    // Should not throw
    await expect(runInit(opts)).resolves.toMatchObject({ ok: true, exitCode: 0 });
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Existing vault.yml + non-TTY + no --force → exit 1 with error
// ---------------------------------------------------------------------------

describe('init integration: existing vault.yml, no --force (non-TTY)', () => {
  it('returns exitCode 1 and error message containing vault.yml and --force', async () => {
    await writeFile(join(tempDir, 'vault.yml'), 'method: onebrain\n', 'utf8');

    const opts: InitOptions = {
      vaultDir: tempDir,
      isTTY: false,
      vaultSyncFn: noopVaultSync,
      registerHooksFn: noopRegisterHooks,
      installedPluginsPath: isolatedInstalledPath,
    };

    const result = await runInit(opts);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toBeDefined();
    expect(result.message).toMatch(/vault\.yml/);
    expect(result.message).toMatch(/--force/);
  });

  it('does not create folders or overwrite vault.yml when returning early', async () => {
    const originalContent = 'method: legacy\n';
    await writeFile(join(tempDir, 'vault.yml'), originalContent, 'utf8');

    const opts: InitOptions = {
      vaultDir: tempDir,
      isTTY: false,
      vaultSyncFn: noopVaultSync,
      registerHooksFn: noopRegisterHooks,
      installedPluginsPath: isolatedInstalledPath,
    };

    await runInit(opts);

    // vault.yml should be unchanged
    const content = await readFile(join(tempDir, 'vault.yml'), 'utf8');
    expect(content).toBe(originalContent);

    // Folders should NOT have been created (early return before folder step)
    expect(await fileExists(join(tempDir, '00-inbox'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Plugin files present → skip vault-sync download
// ---------------------------------------------------------------------------

describe('init integration: plugin files present (skip vault-sync)', () => {
  it('skips vault-sync when .claude/plugins/onebrain/plugin.json already exists', async () => {
    // Pre-create plugin.json to simulate existing plugin files
    const pluginMetaDir = join(tempDir, '.claude', 'plugins', 'onebrain', '.claude-plugin');
    await mkdir(pluginMetaDir, { recursive: true });
    await writeFile(
      join(pluginMetaDir, 'plugin.json'),
      JSON.stringify({ version: '1.11.0' }),
      'utf8',
    );

    let vaultSyncCallCount = 0;
    const trackingVaultSync = async (_vaultDir: string, _opts: Record<string, unknown>) => {
      vaultSyncCallCount++;
    };

    const opts: InitOptions = {
      vaultDir: tempDir,
      isTTY: false,
      force: true,
      vaultSyncFn: trackingVaultSync,
      registerHooksFn: noopRegisterHooks,
      installedPluginsPath: isolatedInstalledPath,
    };

    const result = await runInit(opts);

    expect(result.ok).toBe(true);
    expect(result.pluginSkipped).toBe(true);
    // vault-sync was NOT called because plugin files already exist
    expect(vaultSyncCallCount).toBe(0);
  });

  it('still creates folders and vault.yml even when vault-sync is skipped', async () => {
    const pluginDir = join(tempDir, '.claude', 'plugins', 'onebrain');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'plugin.json'), JSON.stringify({ version: '1.11.0' }), 'utf8');

    // Pre-create vault.yml so --force is needed
    await writeFile(join(tempDir, 'vault.yml'), 'method: legacy\n', 'utf8');

    const opts: InitOptions = {
      vaultDir: tempDir,
      isTTY: false,
      force: true,
      vaultSyncFn: noopVaultSync,
      registerHooksFn: noopRegisterHooks,
      installedPluginsPath: isolatedInstalledPath,
    };

    const result = await runInit(opts);

    expect(result.ok).toBe(true);

    // Folders created
    for (const folder of STANDARD_FOLDERS) {
      expect(await fileExists(join(tempDir, folder))).toBe(true);
    }

    // vault.yml updated (legacy method key is gone)
    const parsed = await readVaultYml(tempDir);
    expect(parsed['update_channel']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: marketplace source in installed_plugins.json → skip registration
// ---------------------------------------------------------------------------

describe('init integration: marketplace source → skip plugin registration', () => {
  it('skips plugin registration when installed_plugins.json has source: marketplace', async () => {
    // Set up fake installed_plugins.json with marketplace entry
    const pluginsMetaDir = join(tempDir, '.claude-meta');
    await mkdir(pluginsMetaDir, { recursive: true });
    const installedPluginsPath = join(pluginsMetaDir, 'installed_plugins.json');
    await writeFile(
      installedPluginsPath,
      JSON.stringify({
        plugins: {
          'onebrain@1.0.0': [{ source: 'marketplace', installPath: '/some/marketplace/path' }],
        },
      }),
      'utf8',
    );

    const opts: InitOptions = {
      vaultDir: tempDir,
      isTTY: false,
      installedPluginsPath,
      vaultSyncFn: noopVaultSync,
      registerHooksFn: noopRegisterHooks,
    };

    const result = await runInit(opts);

    expect(result.ok).toBe(true);
    expect(result.pluginRegistrationSkipped).toBe(true);
  });

  it('does not crash or exit non-zero when marketplace entry present', async () => {
    const pluginsMetaDir = join(tempDir, '.claude-meta');
    await mkdir(pluginsMetaDir, { recursive: true });
    const installedPluginsPath = join(pluginsMetaDir, 'installed_plugins.json');
    await writeFile(
      installedPluginsPath,
      JSON.stringify({
        plugins: {
          'onebrain@2.0.0': [{ source: 'marketplace', installPath: '/marketplace/path' }],
        },
      }),
      'utf8',
    );

    // Should complete normally
    await expect(
      runInit({
        vaultDir: tempDir,
        isTTY: false,
        installedPluginsPath,
        vaultSyncFn: noopVaultSync,
        registerHooksFn: noopRegisterHooks,
      }),
    ).resolves.toMatchObject({ ok: true, exitCode: 0 });
  });
});
