/**
 * vault-sync integration tests (TDD)
 *
 * Uses a mock GitHub tarball — does NOT hit real GitHub.
 * Verifies all 7 steps with a temp vault dir.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildTarSpawnOverrides, runVaultSync } from './vault-sync.js';

// ---------------------------------------------------------------------------
// Suite-level guard: real ~/.claude/plugins/installed_plugins.json must NOT
// be touched by any test in this file (#146 regression hardening). Snapshot
// at suite start, assert byte-identical at suite end. ANY test that omits
// `installedPluginsPath` injection will fail the whole suite.
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
 *   onebrain-ai-onebrain-<sha>/
 *     .claude/plugins/onebrain/.claude-plugin/plugin.json
 *     .claude/plugins/onebrain/INSTRUCTIONS.md
 *     .claude/plugins/onebrain/skills/example/SKILL.md
 *     README.md  CONTRIBUTING.md  CHANGELOG.md
 *     CLAUDE.md  GEMINI.md  AGENTS.md
 */
function buildMockTarball(opts: TarballOpts = {}): Buffer {
  const prefix = opts.prefix ?? 'onebrain-ai-onebrain-abc1234';
  const version = opts.pluginVersion ?? '1.11.0';

  const files: Record<string, string> = {
    [`${prefix}/.claude/plugins/onebrain/.claude-plugin/plugin.json`]: JSON.stringify({
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
  const stageDir = `${tmpdir()}/onebrain-stage-${process.pid}`;
  mkdirSync(stageDir, { recursive: true });

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

  const buf = readFileSync(tarPath);
  rmSync(stageDir, { recursive: true, force: true });
  return buf as Buffer;
}

/**
 * Create a mock fetch that returns the tarball buffer as a Response.
 */
function mockFetchWithTarball(tarball: Buffer): typeof fetch {
  const fn = async (_url: string | URL | Request) => {
    return new Response(tarball, {
      status: 200,
      headers: { 'content-type': 'application/x-gzip' },
    });
  };
  return fn as typeof fetch;
}

// ---------------------------------------------------------------------------
// Test vault setup
// ---------------------------------------------------------------------------

async function makeVaultDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'onebrain-vs-test-'));
}

const VALID_VAULT_YML = 'update_channel: stable\nfolders:\n  inbox: 00-inbox\n  logs: 07-logs\n';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runVaultSync', () => {
  let vaultDir: string;
  let tarball: Buffer;
  // Per-test isolated installed_plugins.json path. Tests that don't override
  // this default still get a temp path — production fallback to ~/.claude/...
  // must NEVER fire from tests (#146).
  let isolatedInstalledPath: string;

  beforeEach(async () => {
    vaultDir = await makeVaultDir();
    await mkdir(join(vaultDir, '.claude'), { recursive: true });
    await writeFile(join(vaultDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    tarball = buildMockTarball({});
    isolatedInstalledPath = join(vaultDir, '.isolated-installed_plugins.json');
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
  });

  // ── Test 1: fresh sync ─────────────────────────────────────────────────

  it('fresh sync: syncs all plugin files and root docs', async () => {
    const result = await runVaultSync(vaultDir, {
      fetchFn: mockFetchWithTarball(tarball),
      installedPluginsPath: isolatedInstalledPath,
    });

    expect(result.ok).toBe(true);
    expect(result.filesAdded).toBeGreaterThan(0);
    expect(result.filesRemoved).toBe(0);

    // plugin.json should be present (lives under .claude-plugin/ within the plugin dir)
    const pluginJson = join(vaultDir, '.claude/plugins/onebrain/.claude-plugin/plugin.json');
    const pj = JSON.parse(await readFile(pluginJson, 'utf8'));
    expect(pj.version).toBe('1.11.0');

    // vault.yml should have update_channel preserved
    const vaultYml = await readFile(join(vaultDir, 'vault.yml'), 'utf8');
    expect(vaultYml).toContain('update_channel: stable');
  });

  // ── Test 2: stale file removal ──────────────────────────────────────────

  it('sync with stale files: removes files not in tarball', async () => {
    // Pre-populate vault plugin dir with a stale file not in tarball
    const pluginDir = join(vaultDir, '.claude/plugins/onebrain');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'stale-file.md'), '# Stale\n', 'utf8');

    const result = await runVaultSync(vaultDir, {
      fetchFn: mockFetchWithTarball(tarball),
      installedPluginsPath: isolatedInstalledPath,
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
      installedPluginsPath: isolatedInstalledPath,
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
      installedPluginsPath: isolatedInstalledPath,
    });

    expect(result.ok).toBe(true);

    const claude = await readFile(join(vaultDir, 'CLAUDE.md'), 'utf8');
    const matches = claude.match(/@\.claude\/plugins\/onebrain\/INSTRUCTIONS\.md/g);
    expect(matches?.length).toBe(1);
    // All three harness files had identical imports — nothing new to inject
    expect(result.importsAdded).toBe(0);
  });

  // ── Test 6: vault.yml version + channel written ─────────────────────────

  it('preserves update_channel in vault.yml', async () => {
    const result = await runVaultSync(vaultDir, {
      fetchFn: mockFetchWithTarball(tarball),
      installedPluginsPath: isolatedInstalledPath,
    });

    expect(result.ok).toBe(true);

    const vaultYml = await readFile(join(vaultDir, 'vault.yml'), 'utf8');
    expect(vaultYml).toContain('update_channel: stable');
    expect(vaultYml).not.toContain('onebrain_version');
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

  // ── Test 10: fetch failure → result.ok is false ────────────────────────

  it('download failure → result.ok is false', async () => {
    const vaultDir2 = await mkdtemp(join(tmpdir(), 'vs-fail-'));
    await writeFile(join(vaultDir2, 'vault.yml'), 'update_channel: stable\n');

    const result = await runVaultSync(vaultDir2, {
      fetchFn: (async () => new Response('Not Found', { status: 404 })) as unknown as typeof fetch,
      installedPluginsPath: join(vaultDir2, '.isolated-installed_plugins.json'),
    });

    expect(result.ok).toBe(false);

    await rm(vaultDir2, { recursive: true });
  });

  // ── Test 11: corrupted tarball → result.ok false, error defined ────────

  it('corrupted tarball → result.ok is false, result.error defined', async () => {
    const result = await runVaultSync(vaultDir, {
      fetchFn: (async () =>
        new Response(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]).buffer, {
          status: 200,
          headers: { 'content-type': 'application/x-gzip' },
        })) as unknown as typeof fetch,
      installedPluginsPath: isolatedInstalledPath,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ── Test 12: HTTP 403 → result.ok false, error contains '403' ──────────

  it('HTTP 403 response → result.ok is false, error contains 403', async () => {
    const result = await runVaultSync(vaultDir, {
      fetchFn: (async () => new Response('Forbidden', { status: 403 })) as unknown as typeof fetch,
      installedPluginsPath: isolatedInstalledPath,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain('403');
  });

  // ── Test 14: pin writes lastUpdated (#132) ─────────────────────────────

  it('pin writes lastUpdated to onebrain@onebrain entry — falls back to now() when plugin.json has none', async () => {
    const pluginsDir = join(vaultDir, '.fake-claude-plugins');
    const cacheDir = join(pluginsDir, 'cache');
    const entryPath = join(cacheDir, 'onebrain', 'onebrain', '1.10.0');
    await mkdir(entryPath, { recursive: true });

    const installedJson = {
      plugins: {
        'onebrain@onebrain': [
          {
            id: 'onebrain',
            source: 'project',
            installPath: entryPath,
            version: '1.10.0',
          },
        ],
      },
    };
    const installedPath = join(pluginsDir, 'installed_plugins.json');
    await writeFile(installedPath, JSON.stringify(installedJson, null, 2), 'utf8');

    // Tarball plugin.json carries no `lastUpdated` → vault-sync falls back to now()
    const fixedNow = new Date('2026-05-06T12:00:00.000Z');
    const result = await runVaultSync(vaultDir, {
      fetchFn: mockFetchWithTarball(tarball),
      installedPluginsPath: installedPath,
      installedPluginsCacheDir: cacheDir,
      now: () => fixedNow,
    });

    expect(result.ok).toBe(true);
    const after = JSON.parse(await readFile(installedPath, 'utf8'));
    const entry = after.plugins['onebrain@onebrain'][0];
    expect(entry.lastUpdated).toBe(fixedNow.toISOString());
    expect(entry.version).toBe('1.11.0'); // matches tarball plugin.json
  });

  // ── Test 15: pin dedups orphan onebrain@onebrain entries (#132) ────────

  it('pin removes orphan onebrain@onebrain entries whose projectPath is missing; preserves others', async () => {
    const pluginsDir = join(vaultDir, '.fake-claude-plugins');
    const cacheDir = join(pluginsDir, 'cache');
    const validProject = await mkdtemp(join(tmpdir(), 'onebrain-valid-vault-'));

    const installedJson = {
      plugins: {
        'onebrain@onebrain': [
          {
            id: 'onebrain',
            source: 'project',
            installPath: join(vaultDir, '.claude/plugins/onebrain'),
            projectPath: validProject,
            version: '1.10.0',
          },
          {
            id: 'onebrain',
            source: 'project',
            installPath: join(vaultDir, '.claude/plugins/onebrain'),
            projectPath: `/tmp/nonexistent-vault-${Date.now()}`,
            version: '1.10.0',
          },
        ],
        // Different plugin — must be preserved entirely (even orphans)
        'other-plugin@somewhere': [
          {
            id: 'other-plugin',
            source: 'project',
            projectPath: `/tmp/another-nonexistent-${Date.now()}`,
          },
        ],
      },
    };
    const installedPath = join(pluginsDir, 'installed_plugins.json');
    await mkdir(pluginsDir, { recursive: true });
    await writeFile(installedPath, JSON.stringify(installedJson, null, 2), 'utf8');

    const result = await runVaultSync(vaultDir, {
      fetchFn: mockFetchWithTarball(tarball),
      installedPluginsPath: installedPath,
      installedPluginsCacheDir: cacheDir,
    });

    expect(result.ok).toBe(true);
    const after = JSON.parse(await readFile(installedPath, 'utf8'));
    // Orphan removed; valid kept
    expect(after.plugins['onebrain@onebrain'].length).toBe(1);
    expect(after.plugins['onebrain@onebrain'][0].projectPath).toBe(validProject);
    // Other plugin entry untouched even though its projectPath also doesn't exist
    expect(after.plugins['other-plugin@somewhere'].length).toBe(1);

    await rm(validProject, { recursive: true });
  });

  // ── Test 13: filesRemoved counts actual deletions only ─────────────────

  it('filesRemoved counts actual deletions: unlinkFn throws for one of 2 stale files → filesRemoved === 1', async () => {
    // Pre-populate vault plugin dir with 2 stale files not in tarball
    const pluginDir = join(vaultDir, '.claude/plugins/onebrain');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'stale-a.md'), '# Stale A\n', 'utf8');
    await writeFile(join(pluginDir, 'stale-b.md'), '# Stale B\n', 'utf8');

    let _callCount = 0;
    const partialUnlink: typeof import('node:fs/promises').unlink = async (path) => {
      _callCount++;
      if (String(path).endsWith('stale-a.md')) {
        const err = new Error('Permission denied') as NodeJS.ErrnoException;
        err.code = 'EACCES';
        throw err;
      }
      const { unlink: realUnlink } = await import('node:fs/promises');
      return realUnlink(path as string);
    };

    const result = await runVaultSync(vaultDir, {
      fetchFn: mockFetchWithTarball(tarball),
      unlinkFn: partialUnlink,
      installedPluginsPath: isolatedInstalledPath,
    });

    expect(result.ok).toBe(true);
    // Only 1 of the 2 stale files was actually deleted
    expect(result.filesRemoved).toBe(1);
  });

  // ── Test 16: cross-vault isolation — syncing vault A leaves vault B alone ──

  it('pin only refreshes the entry whose installPath matches THIS vault', async () => {
    const pluginsDir = join(vaultDir, '.fake-claude-plugins');
    const cacheDir = join(pluginsDir, 'cache');
    await mkdir(pluginsDir, { recursive: true });

    const otherVaultPluginDir = '/path/to/other/vault/.claude/plugins/onebrain';
    const installedJson = {
      plugins: {
        'onebrain@onebrain': [
          {
            // This vault — should be refreshed
            id: 'onebrain',
            source: 'project',
            installPath: join(vaultDir, '.claude/plugins/onebrain'),
            version: '1.10.0',
            lastUpdated: '2026-01-01T00:00:00.000Z',
          },
          {
            // Different vault — must stay byte-identical
            id: 'onebrain',
            source: 'project',
            installPath: otherVaultPluginDir,
            version: '2.0.0',
            lastUpdated: '2025-12-31T23:59:59.000Z',
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
    const after = JSON.parse(await readFile(installedPath, 'utf8'));
    const entries = after.plugins['onebrain@onebrain'];

    // This vault's entry: refreshed to tarball version
    const thisVaultEntry = entries.find(
      (e: { installPath: string }) => e.installPath === join(vaultDir, '.claude/plugins/onebrain'),
    );
    expect(thisVaultEntry.version).toBe('1.11.0');

    // Other vault's entry: untouched
    const otherVaultEntry = entries.find(
      (e: { installPath: string }) => e.installPath === otherVaultPluginDir,
    );
    expect(otherVaultEntry.version).toBe('2.0.0');
    expect(otherVaultEntry.lastUpdated).toBe('2025-12-31T23:59:59.000Z');
  });

  // ── Test 17: idempotency — back-to-back syncs at same version are byte-identical ──

  it('pin is idempotent: second sync at same version produces byte-identical installed_plugins.json', async () => {
    const pluginsDir = join(vaultDir, '.fake-claude-plugins');
    const cacheDir = join(pluginsDir, 'cache');
    await mkdir(pluginsDir, { recursive: true });

    const installedJson = {
      plugins: {
        'onebrain@onebrain': [
          {
            id: 'onebrain',
            source: 'project',
            installPath: join(vaultDir, '.claude/plugins/onebrain'),
            version: '1.11.0', // matches tarball
            lastUpdated: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    };
    const installedPath = join(pluginsDir, 'installed_plugins.json');
    await writeFile(installedPath, JSON.stringify(installedJson, null, 2), 'utf8');

    // First sync
    await runVaultSync(vaultDir, {
      fetchFn: mockFetchWithTarball(tarball),
      installedPluginsPath: installedPath,
      installedPluginsCacheDir: cacheDir,
    });
    const firstBytes = await readFile(installedPath, 'utf8');

    // Second sync with a different `now` — version unchanged → lastUpdated must NOT churn
    await runVaultSync(vaultDir, {
      fetchFn: mockFetchWithTarball(tarball),
      installedPluginsPath: installedPath,
      installedPluginsCacheDir: cacheDir,
      now: () => new Date('2027-06-15T12:00:00.000Z'),
    });
    const secondBytes = await readFile(installedPath, 'utf8');

    expect(secondBytes).toBe(firstBytes);
  });

  // ── Test 18: orphan dedup preserves entry when stat fails with EACCES (#3) ──

  it('orphan dedup preserves entry when projectPath stat throws non-ENOENT (e.g. EACCES on unmounted drive)', async () => {
    // Unix-only: chmod 0o000 doesn't yield EACCES on Windows the same way.
    if (process.platform === 'win32') return;

    const pluginsDir = join(vaultDir, '.fake-claude-plugins');
    const cacheDir = join(pluginsDir, 'cache');
    await mkdir(pluginsDir, { recursive: true });

    // Simulate unmounted external drive: a path under macOS's /Volumes/<missing>
    // would yield ENOENT not EACCES, so we use a path that would EACCES on a
    // real install — e.g. a random component under /private/var/db/* which
    // restricts access. Easier + portable: write into a directory we then
    // chmod 000 so stat() on a nested file returns EACCES.
    const lockedParent = join(vaultDir, 'locked-parent');
    await mkdir(lockedParent, { recursive: true });
    const inaccessiblePath = join(lockedParent, 'subdir');
    await mkdir(inaccessiblePath, { recursive: true });
    // chmod 000 on the parent → stat on inaccessiblePath throws EACCES
    const { chmod } = await import('node:fs/promises');
    await chmod(lockedParent, 0o000);

    const installedJson = {
      plugins: {
        'onebrain@onebrain': [
          {
            id: 'onebrain',
            source: 'project',
            installPath: join(vaultDir, '.claude/plugins/onebrain'),
            projectPath: inaccessiblePath,
            version: '1.10.0',
          },
        ],
      },
    };
    const installedPath = join(pluginsDir, 'installed_plugins.json');
    await writeFile(installedPath, JSON.stringify(installedJson, null, 2), 'utf8');

    try {
      const result = await runVaultSync(vaultDir, {
        fetchFn: mockFetchWithTarball(tarball),
        installedPluginsPath: installedPath,
        installedPluginsCacheDir: cacheDir,
      });

      expect(result.ok).toBe(true);
      const after = JSON.parse(await readFile(installedPath, 'utf8'));
      // Entry preserved despite EACCES
      expect(after.plugins['onebrain@onebrain'].length).toBe(1);
      expect(after.plugins['onebrain@onebrain'][0].projectPath).toBe(inaccessiblePath);
    } finally {
      // Restore perms so afterEach rm -rf can clean up
      await chmod(lockedParent, 0o755);
    }
  });

  // ── Test 19: stale installPath, matching projectPath → refresh + canonicalize (#147) ──

  it('pin matches by projectPath when installPath is stale; rewrites installPath to vaultPluginDir', async () => {
    const pluginsDir = join(vaultDir, '.fake-claude-plugins');
    const cacheDir = join(pluginsDir, 'cache');
    await mkdir(pluginsDir, { recursive: true });

    // A different vault that should NOT be touched (sibling entry).
    const otherProject = await mkdtemp(join(tmpdir(), 'onebrain-other-vault-'));
    const otherInstall = join(otherProject, '.claude', 'plugins', 'onebrain');

    const stalePath = `/tmp/gone-${randomUUID()}`; // does not exist
    const installedJson = {
      plugins: {
        'onebrain@onebrain': [
          {
            id: 'onebrain',
            source: 'project',
            installPath: stalePath, // stale — directory has been deleted
            projectPath: vaultDir, // identifies THIS vault
            version: '1.10.0',
            lastUpdated: '2025-01-01T00:00:00.000Z',
          },
          {
            // Sibling entry — DIFFERENT projectPath, must stay byte-identical
            id: 'onebrain',
            source: 'project',
            installPath: otherInstall,
            projectPath: otherProject,
            version: '2.0.0',
            lastUpdated: '2025-12-31T23:59:59.000Z',
          },
        ],
      },
    };
    const installedPath = join(pluginsDir, 'installed_plugins.json');
    await writeFile(installedPath, JSON.stringify(installedJson, null, 2), 'utf8');

    const fixedNow = new Date('2026-05-06T12:00:00.000Z');
    const result = await runVaultSync(vaultDir, {
      fetchFn: mockFetchWithTarball(tarball),
      installedPluginsPath: installedPath,
      installedPluginsCacheDir: cacheDir,
      now: () => fixedNow,
    });

    expect(result.ok).toBe(true);
    const after = JSON.parse(await readFile(installedPath, 'utf8'));
    const entries = after.plugins['onebrain@onebrain'];

    // Find this-vault entry by projectPath (installPath was rewritten)
    const thisEntry = entries.find((e: { projectPath?: string }) => e.projectPath === vaultDir);
    expect(thisEntry).toBeDefined();
    expect(thisEntry.installPath).toBe(join(vaultDir, '.claude/plugins/onebrain'));
    expect(thisEntry.version).toBe('1.11.0'); // refreshed to tarball
    expect(thisEntry.lastUpdated).toBe(fixedNow.toISOString()); // bumped

    // Sibling entry untouched
    const sibling = entries.find((e: { projectPath?: string }) => e.projectPath === otherProject);
    expect(sibling).toBeDefined();
    expect(sibling.installPath).toBe(otherInstall);
    expect(sibling.version).toBe('2.0.0');
    expect(sibling.lastUpdated).toBe('2025-12-31T23:59:59.000Z');

    await rm(otherProject, { recursive: true, force: true });
  });

  // ── Test 20: trailing-slash on projectPath still matches (#147 path normalization) ──

  it('pin matches projectPath with trailing slash via path normalization', async () => {
    const pluginsDir = join(vaultDir, '.fake-claude-plugins');
    const cacheDir = join(pluginsDir, 'cache');
    await mkdir(pluginsDir, { recursive: true });

    const stalePath = `/tmp/gone-${randomUUID()}`;
    const installedJson = {
      plugins: {
        'onebrain@onebrain': [
          {
            id: 'onebrain',
            source: 'project',
            installPath: stalePath,
            projectPath: `${vaultDir}/`, // trailing slash
            version: '1.10.0',
            lastUpdated: '2025-01-01T00:00:00.000Z',
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
    const after = JSON.parse(await readFile(installedPath, 'utf8'));
    const entry = after.plugins['onebrain@onebrain'][0];
    expect(entry.installPath).toBe(join(vaultDir, '.claude/plugins/onebrain'));
    expect(entry.version).toBe('1.11.0');
  });

  // ── Test 21: malformed entry (non-string installPath) → warn, skip, don't crash ──

  it('pin warns and skips entries with non-string installPath/projectPath; processes siblings normally', async () => {
    const pluginsDir = join(vaultDir, '.fake-claude-plugins');
    const cacheDir = join(pluginsDir, 'cache');
    await mkdir(pluginsDir, { recursive: true });

    const installedJson = {
      plugins: {
        'onebrain@onebrain': [
          {
            // Malformed — installPath is a number, not a string.
            id: 'onebrain',
            source: 'project',
            installPath: 12345 as unknown as string,
            version: '0.0.0',
          },
          {
            // Sibling — valid, must process normally.
            id: 'onebrain',
            source: 'project',
            installPath: join(vaultDir, '.claude/plugins/onebrain'),
            version: '1.10.0',
            lastUpdated: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
    };
    const installedPath = join(pluginsDir, 'installed_plugins.json');
    await writeFile(installedPath, JSON.stringify(installedJson, null, 2), 'utf8');

    // Capture stderr to assert the warning surfaces.
    const stderrChunks: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
    (process.stderr as any).write = (chunk: string | Uint8Array): boolean => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    };

    let result: Awaited<ReturnType<typeof runVaultSync>>;
    try {
      result = await runVaultSync(vaultDir, {
        fetchFn: mockFetchWithTarball(tarball),
        installedPluginsPath: installedPath,
        installedPluginsCacheDir: cacheDir,
      });
    } finally {
      process.stderr.write = originalWrite;
    }

    expect(result.ok).toBe(true);
    const stderr = stderrChunks.join('');
    expect(stderr).toContain('malformed entry');
    expect(stderr).toContain('onebrain@onebrain');

    const after = JSON.parse(await readFile(installedPath, 'utf8'));
    const entries = after.plugins['onebrain@onebrain'];
    // Malformed entry preserved (we don't delete user data).
    expect(entries[0].installPath).toBe(12345);
    expect(entries[0].version).toBe('0.0.0');
    // Sibling refreshed to tarball version.
    expect(entries[1].installPath).toBe(join(vaultDir, '.claude/plugins/onebrain'));
    expect(entries[1].version).toBe('1.11.0');
  });
});

// ---------------------------------------------------------------------------
// buildTarSpawnOverrides — Windows MSYS tar drive-letter workaround (#126)
// ---------------------------------------------------------------------------

describe('buildTarSpawnOverrides', () => {
  it('returns {} on macOS so spread leaves Bun.spawn options unchanged', () => {
    expect(buildTarSpawnOverrides('darwin', { PATH: '/usr/bin' })).toEqual({});
  });

  it('returns {} on Linux', () => {
    expect(buildTarSpawnOverrides('linux', { PATH: '/usr/bin' })).toEqual({});
  });

  it('on win32, sets env.TAR_OPTIONS=--force-local while preserving the parent env', () => {
    const parent = { PATH: 'C:\\Windows', FOO: 'bar' };
    const overrides = buildTarSpawnOverrides('win32', parent);
    expect(overrides.env?.['TAR_OPTIONS']).toBe('--force-local');
    expect(overrides.env?.['PATH']).toBe('C:\\Windows');
    expect(overrides.env?.['FOO']).toBe('bar');
  });

  it('on win32, overrides any pre-existing TAR_OPTIONS so user-set flags do not break extraction', () => {
    // We intentionally override TAR_OPTIONS rather than appending — the user
    // path may have flags incompatible with the inner-loop tar invocation
    // (e.g. `--verbose` would change exit semantics). Document via test.
    const overrides = buildTarSpawnOverrides('win32', { TAR_OPTIONS: '--verbose' });
    expect(overrides.env?.['TAR_OPTIONS']).toBe('--force-local');
  });
});
