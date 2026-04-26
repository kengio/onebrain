import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  checkFolders,
  checkHarnessBinary,
  checkOrphanCheckpoints,
  checkQmdEmbeddings,
  checkSandbox,
  checkVaultYml,
  checkVersionDrift,
  loadVaultConfig,
} from './index.js';
import type { VaultConfig } from './index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_YAML = `
method: onebrain
update_channel: stable
qmd_collection: ob-1-test
folders:
  inbox: 00-inbox
  projects: 01-projects
  areas: 02-areas
  knowledge: 03-knowledge
  resources: 04-resources
  agent: 05-agent
  archive: 06-archive
  logs: 07-logs
checkpoint:
  messages: 15
  minutes: 30
`.trim();

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'onebrain-core-test-'));
}

async function writeVaultYml(dir: string, content: string): Promise<void> {
  await writeFile(join(dir, 'vault.yml'), content, 'utf8');
}

async function makeStandardFolders(dir: string, config: VaultConfig): Promise<void> {
  const { folders } = config;
  const names = [
    folders.inbox,
    folders.projects,
    folders.areas,
    folders.knowledge,
    folders.resources,
    folders.agent,
    folders.archive,
    folders.logs,
  ];
  for (const name of names) {
    await mkdir(join(dir, name), { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// loadVaultConfig
// ---------------------------------------------------------------------------

describe('loadVaultConfig', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('parses a valid vault.yml into correct VaultConfig shape', async () => {
    await writeVaultYml(dir, VALID_YAML);
    const config = await loadVaultConfig(dir);

    expect(config.folders.inbox).toBe('00-inbox');
    expect(config.folders.projects).toBe('01-projects');
    expect(config.folders.areas).toBe('02-areas');
    expect(config.folders.knowledge).toBe('03-knowledge');
    expect(config.folders.resources).toBe('04-resources');
    expect(config.folders.agent).toBe('05-agent');
    expect(config.folders.archive).toBe('06-archive');
    expect(config.folders.logs).toBe('07-logs');
    expect(config.qmd_collection).toBe('ob-1-test');
    expect(config.update_channel).toBe('stable');
    expect(config.checkpoint?.messages).toBe(15);
    expect(config.checkpoint?.minutes).toBe(30);
  });

  it('throws a clear error when vault.yml is missing', async () => {
    await expect(loadVaultConfig(dir)).rejects.toThrow(
      `vault.yml not found at ${join(dir, 'vault.yml')}. Run onebrain init to set up this vault.`,
    );
  });

  it('fills default folder names when folders section is absent', async () => {
    await writeVaultYml(dir, 'method: onebrain\n');
    const config = await loadVaultConfig(dir);

    expect(config.folders.inbox).toBe('00-inbox');
    expect(config.folders.projects).toBe('01-projects');
    expect(config.folders.areas).toBe('02-areas');
    expect(config.folders.knowledge).toBe('03-knowledge');
    expect(config.folders.resources).toBe('04-resources');
    expect(config.folders.agent).toBe('05-agent');
    expect(config.folders.archive).toBe('06-archive');
    expect(config.folders.logs).toBe('07-logs');
  });

  it('fills default checkpoint values when checkpoint is absent', async () => {
    await writeVaultYml(dir, 'method: onebrain\n');
    const config = await loadVaultConfig(dir);

    expect(config.checkpoint?.messages).toBe(15);
    expect(config.checkpoint?.minutes).toBe(30);
  });

  it('fills default update_channel when absent', async () => {
    await writeVaultYml(dir, 'method: onebrain\n');
    const config = await loadVaultConfig(dir);

    expect(config.update_channel).toBe('stable');
  });

  it('preserves provided update_channel', async () => {
    await writeVaultYml(dir, 'update_channel: next\n');
    const config = await loadVaultConfig(dir);

    expect(config.update_channel).toBe('next');
  });

  it('throws when vault.yml is a bare scalar', async () => {
    await writeVaultYml(dir, 'just a string');
    await expect(loadVaultConfig(dir)).rejects.toThrow('must be a YAML mapping');
  });

  it('preserves optional fields when present', async () => {
    const yaml = `
onebrain_version: "1.9.0"
sandbox:
  enabled: true
runtime:
  harness: claude-code
recap:
  min_sessions: 3
  min_frequency: 7
`.trim();
    await writeVaultYml(dir, yaml);
    const config = await loadVaultConfig(dir);

    expect(config.onebrain_version).toBe('1.9.0');
    expect(config.sandbox?.enabled).toBe(true);
    expect(config.runtime?.harness).toBe('claude-code');
    expect(config.recap?.min_sessions).toBe(3);
    expect(config.recap?.min_frequency).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// checkVaultYml
// ---------------------------------------------------------------------------

describe('checkVaultYml', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns ok when vault.yml exists and is valid YAML', async () => {
    await writeVaultYml(dir, VALID_YAML);
    const result = await checkVaultYml(dir);

    expect(result.status).toBe('ok');
    expect(result.check).toBe('vault.yml');
  });

  it('returns error when vault.yml is missing', async () => {
    const result = await checkVaultYml(dir);

    expect(result.status).toBe('error');
    expect(result.hint).toContain('onebrain init');
  });

  it('returns error when vault.yml contains invalid YAML', async () => {
    await writeVaultYml(dir, 'key: [\nbad yaml{{{\n');
    const result = await checkVaultYml(dir);

    expect(result.status).toBe('error');
    expect(result.hint).toContain('syntax');
  });
});

// ---------------------------------------------------------------------------
// checkFolders
// ---------------------------------------------------------------------------

describe('checkFolders', () => {
  let dir: string;
  let config: VaultConfig;

  beforeEach(async () => {
    dir = await makeTmpDir();
    // Use a config with known defaults
    config = {
      folders: {
        inbox: '00-inbox',
        projects: '01-projects',
        areas: '02-areas',
        knowledge: '03-knowledge',
        resources: '04-resources',
        agent: '05-agent',
        archive: '06-archive',
        logs: '07-logs',
      },
      checkpoint: { messages: 15, minutes: 30 },
      update_channel: 'stable',
    };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns ok with "8/8 present" when all folders exist', async () => {
    await makeStandardFolders(dir, config);
    const result = await checkFolders(dir, config);

    expect(result.status).toBe('ok');
    expect(result.message).toBe('8/8 present');
  });

  it('returns warn listing missing folders when some are absent', async () => {
    // Only create half the folders
    await mkdir(join(dir, '00-inbox'), { recursive: true });
    await mkdir(join(dir, '01-projects'), { recursive: true });
    const result = await checkFolders(dir, config);

    expect(result.status).toBe('warn');
    expect(result.message).toContain('2/8');
    expect(result.hint).toContain('02-areas');
    expect(result.hint).toContain('03-knowledge');
  });

  it('returns warn listing all missing folders when none exist', async () => {
    const result = await checkFolders(dir, config);

    expect(result.status).toBe('warn');
    expect(result.message).toContain('0/8');
  });
});

// ---------------------------------------------------------------------------
// checkHarnessBinary
// ---------------------------------------------------------------------------

describe('checkHarnessBinary', () => {
  it('returns ok for "direct" harness without checking PATH', async () => {
    const config: VaultConfig = {
      folders: {
        inbox: '00-inbox',
        projects: '01-projects',
        areas: '02-areas',
        knowledge: '03-knowledge',
        resources: '04-resources',
        agent: '05-agent',
        archive: '06-archive',
        logs: '07-logs',
      },
      checkpoint: { messages: 15, minutes: 30 },
      update_channel: 'stable',
      runtime: { harness: 'direct' },
    };
    const result = await checkHarnessBinary(config);

    expect(result.status).toBe('ok');
  });

  it('returns ok when runtime is absent', async () => {
    const config: VaultConfig = {
      folders: {
        inbox: '00-inbox',
        projects: '01-projects',
        areas: '02-areas',
        knowledge: '03-knowledge',
        resources: '04-resources',
        agent: '05-agent',
        archive: '06-archive',
        logs: '07-logs',
      },
      checkpoint: { messages: 15, minutes: 30 },
      update_channel: 'stable',
    };
    const result = await checkHarnessBinary(config);

    expect(result.status).toBe('ok');
  });

  it('whichFn returns null with claude-code harness → status: warn, hint defined', async () => {
    const config: VaultConfig = {
      folders: {
        inbox: '00-inbox',
        projects: '01-projects',
        areas: '02-areas',
        knowledge: '03-knowledge',
        resources: '04-resources',
        agent: '05-agent',
        archive: '06-archive',
        logs: '07-logs',
      },
      checkpoint: { messages: 15, minutes: 30 },
      update_channel: 'stable',
      runtime: { harness: 'claude-code' },
    };
    const result = await checkHarnessBinary(config, () => null);

    expect(result.status).toBe('warn');
    expect(result.check).toBe('runtime.harness');
    expect(result.hint).toBeDefined();
  });

  it('whichFn returns path with claude-code harness → status: ok, message contains found', async () => {
    const config: VaultConfig = {
      folders: {
        inbox: '00-inbox',
        projects: '01-projects',
        areas: '02-areas',
        knowledge: '03-knowledge',
        resources: '04-resources',
        agent: '05-agent',
        archive: '06-archive',
        logs: '07-logs',
      },
      checkpoint: { messages: 15, minutes: 30 },
      update_channel: 'stable',
      runtime: { harness: 'claude-code' },
    };
    const result = await checkHarnessBinary(config, () => '/usr/local/bin/claude');

    expect(result.status).toBe('ok');
    expect(result.check).toBe('runtime.harness');
    expect(result.message).toContain('found');
  });
});

// ---------------------------------------------------------------------------
// checkQmdEmbeddings
// ---------------------------------------------------------------------------

describe('checkQmdEmbeddings', () => {
  it('returns ok with "qmd not configured" when qmd_collection is absent', async () => {
    const config: VaultConfig = {
      folders: {
        inbox: '00-inbox',
        projects: '01-projects',
        areas: '02-areas',
        knowledge: '03-knowledge',
        resources: '04-resources',
        agent: '05-agent',
        archive: '06-archive',
        logs: '07-logs',
      },
      checkpoint: { messages: 15, minutes: 30 },
      update_channel: 'stable',
    };
    const result = await checkQmdEmbeddings(config);

    expect(result.status).toBe('ok');
    expect(result.message).toContain('not configured');
  });

  it('returns ok with "qmd status unavailable" when qmd command fails', async () => {
    const config: VaultConfig = {
      folders: {
        inbox: '00-inbox',
        projects: '01-projects',
        areas: '02-areas',
        knowledge: '03-knowledge',
        resources: '04-resources',
        agent: '05-agent',
        archive: '06-archive',
        logs: '07-logs',
      },
      checkpoint: { messages: 15, minutes: 30 },
      update_channel: 'stable',
      qmd_collection: 'test-collection',
    };
    // In test env qmd binary likely not present — should gracefully return ok
    const result = await checkQmdEmbeddings(config);

    expect(result.check).toBe('qmd-embeddings');
    // Either unavailable (ok) or actually ran — both valid
    expect(['ok', 'warn']).toContain(result.status);
  });
});

// ---------------------------------------------------------------------------
// checkVersionDrift
// ---------------------------------------------------------------------------

describe('checkVersionDrift', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const baseConfig: VaultConfig = {
    folders: {
      inbox: '00-inbox',
      projects: '01-projects',
      areas: '02-areas',
      knowledge: '03-knowledge',
      resources: '04-resources',
      agent: '05-agent',
      archive: '06-archive',
      logs: '07-logs',
    },
    checkpoint: { messages: 15, minutes: 30 },
    update_channel: 'stable',
  };

  it('returns ok when both versions match', async () => {
    const pluginDir = join(dir, '.claude', 'plugins', 'onebrain', '.claude-plugin');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'plugin.json'), JSON.stringify({ version: '1.9.0' }), 'utf8');
    const config = { ...baseConfig, onebrain_version: '1.9.0' };

    const result = await checkVersionDrift(dir, config);

    expect(result.status).toBe('ok');
  });

  it('returns ok when onebrain_version is absent in config', async () => {
    const result = await checkVersionDrift(dir, baseConfig);
    expect(result.status).toBe('ok');
  });

  it('returns ok when plugin.json is missing', async () => {
    const config = { ...baseConfig, onebrain_version: '1.9.0' };
    const result = await checkVersionDrift(dir, config);
    expect(result.status).toBe('ok');
  });

  it('returns warn when versions differ', async () => {
    const pluginDir = join(dir, '.claude', 'plugins', 'onebrain', '.claude-plugin');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'plugin.json'), JSON.stringify({ version: '1.8.0' }), 'utf8');
    const config = { ...baseConfig, onebrain_version: '1.9.0' };

    const result = await checkVersionDrift(dir, config);

    expect(result.status).toBe('warn');
    expect(result.message).toContain('1.9.0');
    expect(result.message).toContain('1.8.0');
    expect(result.hint).toContain('onebrain update');
  });

  it('plugin.json with no version field → status: ok, message contains skip', async () => {
    const pluginDir = join(dir, '.claude', 'plugins', 'onebrain', '.claude-plugin');
    await mkdir(pluginDir, { recursive: true });
    await writeFile(join(pluginDir, 'plugin.json'), JSON.stringify({ id: 'onebrain' }), 'utf8');
    const config = { ...baseConfig, onebrain_version: '1.9.0' };

    const result = await checkVersionDrift(dir, config);

    expect(result.status).toBe('ok');
    expect(result.message).toContain('skip');
  });
});

// ---------------------------------------------------------------------------
// checkOrphanCheckpoints
// ---------------------------------------------------------------------------

describe('checkOrphanCheckpoints', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const baseConfig: VaultConfig = {
    folders: {
      inbox: '00-inbox',
      projects: '01-projects',
      areas: '02-areas',
      knowledge: '03-knowledge',
      resources: '04-resources',
      agent: '05-agent',
      archive: '06-archive',
      logs: '07-logs',
    },
    checkpoint: { messages: 15, minutes: 30 },
    update_channel: 'stable',
  };

  it('returns ok when no checkpoint files exist', async () => {
    const result = await checkOrphanCheckpoints(dir, baseConfig);
    expect(result.status).toBe('ok');
  });

  it('returns ok when all checkpoints have merged: true', async () => {
    const logsDir = join(dir, '07-logs', '2026', '04');
    await mkdir(logsDir, { recursive: true });
    const content = '---\ntags: [checkpoint]\nmerged: true\n---\n\n## What We Worked On\nDone.';
    await writeFile(join(logsDir, '2026-04-24-abc123-checkpoint-01.md'), content, 'utf8');

    const result = await checkOrphanCheckpoints(dir, baseConfig);
    expect(result.status).toBe('ok');
    expect(result.message).toContain('0');
  });

  it('returns warn when unmerged checkpoint files exist', async () => {
    const logsDir = join(dir, '07-logs', '2026', '04');
    await mkdir(logsDir, { recursive: true });
    const unmerged =
      '---\ntags: [checkpoint]\nmerged: false\n---\n\n## What We Worked On\nPending.';
    const merged = '---\ntags: [checkpoint]\nmerged: true\n---\n\n## What We Worked On\nDone.';
    await writeFile(join(logsDir, '2026-04-24-abc123-checkpoint-01.md'), unmerged, 'utf8');
    await writeFile(join(logsDir, '2026-04-24-abc456-checkpoint-01.md'), merged, 'utf8');

    const result = await checkOrphanCheckpoints(dir, baseConfig);

    expect(result.status).toBe('warn');
    expect(result.message).toContain('1');
    expect(result.message).toContain('07-logs');
  });

  it('treats checkpoint without merged field as unmerged', async () => {
    const logsDir = join(dir, '07-logs', '2026', '04');
    await mkdir(logsDir, { recursive: true });
    // No merged field in frontmatter
    const content = '---\ntags: [checkpoint]\n---\n\n## What We Worked On\nMissing merged field.';
    await writeFile(join(logsDir, '2026-04-24-def789-checkpoint-01.md'), content, 'utf8');

    const result = await checkOrphanCheckpoints(dir, baseConfig);

    expect(result.status).toBe('warn');
    expect(result.message).toContain('1');
  });
});

// ---------------------------------------------------------------------------
// checkSandbox
// ---------------------------------------------------------------------------

describe('checkSandbox', () => {
  const baseConfig: VaultConfig = {
    folders: {
      inbox: '00-inbox',
      projects: '01-projects',
      areas: '02-areas',
      knowledge: '03-knowledge',
      resources: '04-resources',
      agent: '05-agent',
      archive: '06-archive',
      logs: '07-logs',
    },
    checkpoint: { messages: 15, minutes: 30 },
    update_channel: 'stable',
  };

  it('returns ok when sandbox.enabled is true', () => {
    const config = { ...baseConfig, sandbox: { enabled: true } };
    const result = checkSandbox(config);

    expect(result.status).toBe('ok');
    expect(result.check).toBe('sandbox');
  });

  it('returns warn when sandbox is absent', () => {
    const result = checkSandbox(baseConfig);

    expect(result.status).toBe('warn');
    expect(result.message).toBe('disabled');
    expect(result.hint).toContain('vault.yml');
  });

  it('returns warn when sandbox.enabled is false', () => {
    const config = { ...baseConfig, sandbox: { enabled: false } };
    const result = checkSandbox(config);

    expect(result.status).toBe('warn');
    expect(result.message).toBe('disabled');
  });
});
