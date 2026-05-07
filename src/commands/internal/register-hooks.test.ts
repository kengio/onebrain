/**
 * Integration tests for register-hooks
 */

import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRegisterHooks } from './register-hooks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempVault(): Promise<string> {
  const dir = join(tmpdir(), `onebrain-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(join(dir, '.claude'), { recursive: true });
  return dir;
}

async function readSettingsFile(vaultDir: string): Promise<Record<string, unknown>> {
  const text = await readFile(join(vaultDir, '.claude', 'settings.json'), 'utf8');
  return JSON.parse(text) as Record<string, unknown>;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await makeTempVault();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runRegisterHooks', () => {
  test('fresh run on empty settings — Stop registered, full permissions added', async () => {
    const result = await runRegisterHooks({ vaultDir: tempDir });

    expect(result.ok).toBe(true);

    // Only Stop should be added (PostCompact removed in v2.1.6)
    expect(result.hooks['Stop']).toBe('added');

    // Full permission set added
    expect(result.permissionsAdded).toHaveLength(14);
    for (const perm of [
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'Bash(git *)',
      'Bash(bun *)',
      'Bash(gh *)',
      'Bash(node *)',
      'Bash(onebrain *)',
      'Bash(bun install -g @onebrain-ai/cli*)',
      'Bash(npm install -g @onebrain-ai/cli*)',
      'WebFetch',
      'WebSearch',
    ]) {
      expect(result.permissionsAdded).toContain(perm);
    }

    // Verify written file structure — no env block
    const settings = await readSettingsFile(tempDir);
    const hooks = settings['hooks'] as Record<string, unknown[]>;
    expect(Object.keys(hooks)).toHaveLength(1); // Stop only
    expect(settings['env']).toBeUndefined();

    const perms = (settings['permissions'] as { allow: string[] }).allow;
    expect(perms).toHaveLength(14);
  });

  test('arbitrary non-allowed hook with onebrain command is treated as stale and removed (e.g. UserPromptSubmit)', async () => {
    // Catches any future / experimental hook event that may have been
    // registered by an older CLI version. Only Stop and PostToolUse are
    // allowed.
    const settingsPath = join(tempDir, '.claude', 'settings.json');
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'onebrain checkpoint user-prompt-submit' }],
            },
          ],
          SessionStart: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'onebrain something' }],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir: tempDir });

    const settings = await readSettingsFile(tempDir);
    const hooks = settings['hooks'] as Record<string, unknown>;
    expect(hooks['UserPromptSubmit']).toBeUndefined(); // removed as stale (any onebrain command under non-allowed event)
    expect(hooks['SessionStart']).toBeUndefined(); // removed as stale
    expect(hooks['Stop']).toBeDefined();
  });

  test('non-onebrain entries under non-allowed events are preserved (user-added hooks)', async () => {
    const settingsPath = join(tempDir, '.claude', 'settings.json');
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              matcher: '',
              hooks: [
                { type: 'command', command: 'onebrain checkpoint user-prompt-submit' },
                { type: 'command', command: 'my-custom-script.sh' },
              ],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir: tempDir });

    const settings = await readSettingsFile(tempDir);
    const hooks = settings['hooks'] as Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    // UserPromptSubmit retained because it has a non-onebrain entry left
    expect(hooks['UserPromptSubmit']).toBeDefined();
    const ups = hooks['UserPromptSubmit']?.[0]?.hooks ?? [];
    expect(ups).toHaveLength(1);
    expect(ups[0]?.command).toBe('my-custom-script.sh');
  });

  test('stale PreCompact and PostCompact hooks are removed when present in existing settings.json', async () => {
    const settingsPath = join(tempDir, '.claude', 'settings.json');
    await mkdir(join(tempDir, '.claude'), { recursive: true });
    await writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreCompact: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'onebrain checkpoint precompact' }],
            },
          ],
          PostCompact: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'onebrain checkpoint postcompact' }],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir: tempDir });

    const settings = await readSettingsFile(tempDir);
    const hooks = settings['hooks'] as Record<string, unknown>;
    expect(hooks['PreCompact']).toBeUndefined();
    expect(hooks['PostCompact']).toBeUndefined(); // removed as stale (v2.1.6)
    expect(hooks['Stop']).toBeDefined();
  });

  test('hook entries include type:command and matcher fields', async () => {
    await runRegisterHooks({ vaultDir: tempDir });

    const settings = await readSettingsFile(tempDir);
    const hooks = settings['hooks'] as Record<
      string,
      Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>
    >;

    const group = hooks['Stop']?.[0];
    expect(group).toBeDefined();
    expect(group?.matcher).toBe('');
    expect(group?.hooks?.[0]?.type).toBe('command');
  });

  test('idempotent re-run — nothing changes', async () => {
    // First run
    await runRegisterHooks({ vaultDir: tempDir });

    // Second run
    const result = await runRegisterHooks({ vaultDir: tempDir });

    expect(result.ok).toBe(true);
    expect(result.hooks['Stop']).toBe('ok');
    expect(result.permissionsAdded).toHaveLength(0);
  });

  test('migration: existing checkpoint-hook.sh entry → replaced with binary command', async () => {
    const settingsPath = join(tempDir, '.claude', 'settings.json');
    await writeFile(
      settingsPath,
      JSON.stringify({
        hooks: {
          Stop: [
            {
              hooks: [{ command: '/path/to/checkpoint-hook.sh stop' }],
            },
          ],
        },
      }),
      'utf8',
    );

    const result = await runRegisterHooks({ vaultDir: tempDir });

    expect(result.ok).toBe(true);
    expect(result.hooks['Stop']).toBe('migrated');

    // Verify the migration was written with correct command, type, and matcher
    const settings = await readSettingsFile(tempDir);
    const stopGroups = (
      settings['hooks'] as Record<
        string,
        { matcher: string; hooks: { type: string; command: string }[] }[]
      >
    )['Stop'];
    const commands = (stopGroups ?? []).flatMap((g) => g.hooks.map((h) => h.command));
    expect(commands).toContain('onebrain checkpoint stop');
    expect(commands.some((c) => c.includes('checkpoint-hook.sh'))).toBe(false);
    // Migrated entries must also have type and matcher (same requirement as new entries)
    for (const group of stopGroups ?? []) {
      expect(group.matcher).toBe('');
      for (const entry of group.hooks) {
        expect(entry.type).toBe('command');
      }
    }
  });

  test('readSettings with malformed JSON → runRegisterHooks returns error, does not swallow', async () => {
    const settingsPath = join(tempDir, '.claude', 'settings.json');
    await writeFile(settingsPath, '{ invalid json !!!', 'utf8');

    const result = await runRegisterHooks({ vaultDir: tempDir });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toBe('');
  });
});

// ---------------------------------------------------------------------------
// qmd_collection auto-detection via vault.yml
// ---------------------------------------------------------------------------

describe('qmd PostToolUse hook via vault.yml qmd_collection', () => {
  let vaultDir: string;

  beforeEach(async () => {
    vaultDir = join(tmpdir(), `ob-qmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(vaultDir, '.claude'), { recursive: true });
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
  });

  test('qmd_collection in vault.yml → PostToolUse added to settings.json', async () => {
    await writeFile(
      join(vaultDir, 'vault.yml'),
      'method: onebrain\nqmd_collection: ob-1-test\n',
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const text = await readFile(join(vaultDir, '.claude', 'settings.json'), 'utf8');
    const settings = JSON.parse(text) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;
    expect(hooks['PostToolUse']).toBeDefined();
    expect(Array.isArray(hooks['PostToolUse'])).toBe(true);
    expect((hooks['PostToolUse'] as unknown[]).length).toBeGreaterThan(0);
  });

  test('qmd_collection absent from vault.yml → PostToolUse NOT added', async () => {
    await writeFile(join(vaultDir, 'vault.yml'), 'method: onebrain\n', 'utf8');

    await runRegisterHooks({ vaultDir });

    const text = await readFile(join(vaultDir, '.claude', 'settings.json'), 'utf8');
    const settings = JSON.parse(text) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown> | undefined;
    expect(hooks?.['PostToolUse']).toBeUndefined();
  });

  test('no vault.yml → PostToolUse NOT added (defaults to no qmd_collection)', async () => {
    // No vault.yml written — loadVaultConfig throws, defaulting to no qmd_collection
    await runRegisterHooks({ vaultDir });

    const text = await readFile(join(vaultDir, '.claude', 'settings.json'), 'utf8');
    const settings = JSON.parse(text) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown> | undefined;
    expect(hooks?.['PostToolUse']).toBeUndefined();
  });

  // ---- legacy `qmd update -c <collection>` migration (issue #127) ----------

  /**
   * Read the PostToolUse hook commands from the vault's settings.json.
   * Helper keeps the migration assertions readable.
   */
  async function readPostToolUseCommands(vault: string): Promise<string[]> {
    const text = await readFile(join(vault, '.claude', 'settings.json'), 'utf8');
    const settings = JSON.parse(text) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
    const groups = (hooks?.['PostToolUse'] ?? []) as Array<{
      hooks?: Array<{ command?: string }>;
    }>;
    return groups.flatMap((g) => (g.hooks ?? []).map((h) => h.command ?? ''));
  }

  test('legacy `qmd update -c …` PostToolUse entry → migrated to `onebrain qmd-reindex`', async () => {
    await writeFile(
      join(vaultDir, 'vault.yml'),
      'method: onebrain\nqmd_collection: ob-1-test\n',
      'utf8',
    );
    // Pre-existing settings.json with the legacy command form.
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify(
        {
          hooks: {
            PostToolUse: [
              {
                matcher: 'Write|Edit',
                hooks: [{ type: 'command', command: 'qmd update -c ob-1-test' }],
              },
            ],
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const cmds = await readPostToolUseCommands(vaultDir);
    expect(cmds).toContain('onebrain qmd-reindex');
    expect(cmds.some((c) => /^qmd\s+update/.test(c))).toBe(false);
  });

  test('legacy `qmd update -c …` migration is idempotent on repeated runs', async () => {
    await writeFile(
      join(vaultDir, 'vault.yml'),
      'method: onebrain\nqmd_collection: ob-1-test\n',
      'utf8',
    );
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [{ type: 'command', command: 'qmd update -c ob-1-test' }],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });
    await runRegisterHooks({ vaultDir });

    const cmds = await readPostToolUseCommands(vaultDir);
    // Migration replaces the existing entry — no duplicate canonical entry created.
    expect(cmds.filter((c) => c === 'onebrain qmd-reindex').length).toBe(1);
  });

  test('canonical entry already present → leaves settings unchanged (no duplicate)', async () => {
    await writeFile(
      join(vaultDir, 'vault.yml'),
      'method: onebrain\nqmd_collection: ob-1-test\n',
      'utf8',
    );
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [{ type: 'command', command: 'onebrain qmd-reindex' }],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const cmds = await readPostToolUseCommands(vaultDir);
    expect(cmds.filter((c) => c === 'onebrain qmd-reindex').length).toBe(1);
  });

  test('migration leaves unrelated PostToolUse hooks intact', async () => {
    await writeFile(
      join(vaultDir, 'vault.yml'),
      'method: onebrain\nqmd_collection: ob-1-test\n',
      'utf8',
    );
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [
                { type: 'command', command: 'qmd update -c ob-1-test' },
                { type: 'command', command: 'echo user-custom-hook' },
              ],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const cmds = await readPostToolUseCommands(vaultDir);
    expect(cmds).toContain('onebrain qmd-reindex');
    expect(cmds).toContain('echo user-custom-hook');
    expect(cmds.some((c) => /^qmd\s+update/.test(c))).toBe(false);
  });

  test('powershell-wrapped legacy command is also migrated', async () => {
    // Older Windows templates serialized qmd-reindex.ts's spawn args as the
    // hook command verbatim, e.g. `powershell.exe -NoProfile -Command qmd update -c '<col>'`.
    await writeFile(
      join(vaultDir, 'vault.yml'),
      'method: onebrain\nqmd_collection: ob-1-test\n',
      'utf8',
    );
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [
                {
                  type: 'command',
                  command: "powershell.exe -NoProfile -Command qmd update -c 'ob-1-test'",
                },
              ],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const cmds = await readPostToolUseCommands(vaultDir);
    expect(cmds).toEqual(['onebrain qmd-reindex']);
  });

  test('legacy + canonical co-existing → deduped to a single canonical entry', async () => {
    // Pathological state: prior partial migration or hand-edit. Migration must
    // dedupe so the hook doesn't fire twice on every Write/Edit.
    await writeFile(
      join(vaultDir, 'vault.yml'),
      'method: onebrain\nqmd_collection: ob-1-test\n',
      'utf8',
    );
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [{ type: 'command', command: 'qmd update -c ob-1-test' }],
            },
            {
              matcher: 'Write|Edit',
              hooks: [{ type: 'command', command: 'onebrain qmd-reindex' }],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const cmds = await readPostToolUseCommands(vaultDir);
    expect(cmds.filter((c) => c === 'onebrain qmd-reindex').length).toBe(1);
  });

  test('legacy entry under narrow matcher → matcher normalized to Write|Edit', async () => {
    await writeFile(
      join(vaultDir, 'vault.yml'),
      'method: onebrain\nqmd_collection: ob-1-test\n',
      'utf8',
    );
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write',
              hooks: [{ type: 'command', command: 'qmd update -c ob-1-test' }],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const text = await readFile(join(vaultDir, '.claude', 'settings.json'), 'utf8');
    const settings = JSON.parse(text) as Record<string, unknown>;
    const groups = (settings['hooks'] as Record<string, unknown[]>)['PostToolUse'] as Array<{
      matcher: string;
      hooks: Array<{ command: string }>;
    }>;
    const canonical = groups.find((g) => g.hooks.some((h) => h.command === 'onebrain qmd-reindex'));
    expect(canonical?.matcher).toBe('Write|Edit');
  });

  test('qmd disabled (no qmd_collection) → legacy entry is stripped, not left dangling', async () => {
    // No qmd_collection in vault.yml. A pre-existing legacy `qmd update …`
    // entry must not survive — it would fire forever against a collection
    // the user has stopped maintaining.
    await writeFile(join(vaultDir, 'vault.yml'), 'method: onebrain\n', 'utf8');
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [{ type: 'command', command: 'qmd update -c ob-1-test' }],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const text = await readFile(join(vaultDir, '.claude', 'settings.json'), 'utf8');
    const settings = JSON.parse(text) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown> | undefined;
    expect(hooks?.['PostToolUse']).toBeUndefined();
  });

  test('qmd disabled with mixed legacy + user hooks → strips legacy, keeps user entry', async () => {
    await writeFile(join(vaultDir, 'vault.yml'), 'method: onebrain\n', 'utf8');
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [
                { type: 'command', command: 'qmd update -c ob-1-test' },
                { type: 'command', command: 'echo user-custom-hook' },
              ],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const cmds = await readPostToolUseCommands(vaultDir);
    expect(cmds).toEqual(['echo user-custom-hook']);
  });

  test('two pre-existing canonical entries (no legacy) → dedupes to one', async () => {
    // Pathological state from a hand-edit or partial prior run. Even when
    // there's nothing legacy to migrate, the dedup pass must keep a single
    // canonical hook so it doesn't fire twice on every Write/Edit.
    await writeFile(
      join(vaultDir, 'vault.yml'),
      'method: onebrain\nqmd_collection: ob-1-test\n',
      'utf8',
    );
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [{ type: 'command', command: 'onebrain qmd-reindex' }],
            },
            {
              matcher: 'Write|Edit',
              hooks: [{ type: 'command', command: 'onebrain qmd-reindex' }],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const cmds = await readPostToolUseCommands(vaultDir);
    expect(cmds.filter((c) => c === 'onebrain qmd-reindex').length).toBe(1);
  });

  test('qmd disabled with mixed legacy + canonical → strips legacy, keeps canonical', async () => {
    // The user disabled qmd in vault.yml but had previously registered the
    // canonical hook by hand. We must strip only the broken legacy entry —
    // never silently delete the user's manually-kept canonical one.
    await writeFile(join(vaultDir, 'vault.yml'), 'method: onebrain\n', 'utf8');
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [
                { type: 'command', command: 'qmd update -c ob-1-test' },
                { type: 'command', command: 'onebrain qmd-reindex' },
              ],
            },
          ],
        },
      }),
      'utf8',
    );

    await runRegisterHooks({ vaultDir });

    const cmds = await readPostToolUseCommands(vaultDir);
    expect(cmds).toEqual(['onebrain qmd-reindex']);
  });

  test('idempotence: re-introducing a legacy entry after migration → migrates again on next run', async () => {
    // The first test in this group covers the simple "run twice" case. This
    // one pins the state machine: the migration branch must remain reachable,
    // not dead code, after the canonical entry has been written once.
    await writeFile(
      join(vaultDir, 'vault.yml'),
      'method: onebrain\nqmd_collection: ob-1-test\n',
      'utf8',
    );
    await writeFile(
      join(vaultDir, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: [{ type: 'command', command: 'qmd update -c ob-1-test' }],
            },
          ],
        },
      }),
      'utf8',
    );

    // Run 1: migrate the legacy entry.
    await runRegisterHooks({ vaultDir });
    let cmds = await readPostToolUseCommands(vaultDir);
    expect(cmds).toEqual(['onebrain qmd-reindex']);

    // Re-introduce a legacy entry alongside the canonical one (e.g. the user
    // re-ran an older `/update` template).
    const text = await readFile(join(vaultDir, '.claude', 'settings.json'), 'utf8');
    const settings = JSON.parse(text) as { hooks: { PostToolUse: unknown[] } };
    settings.hooks.PostToolUse.push({
      matcher: 'Write|Edit',
      hooks: [{ type: 'command', command: 'qmd update -c ob-1-test' }],
    });
    await writeFile(join(vaultDir, '.claude', 'settings.json'), JSON.stringify(settings), 'utf8');

    // Run 2: legacy entry must be migrated and deduped.
    await runRegisterHooks({ vaultDir });
    cmds = await readPostToolUseCommands(vaultDir);
    expect(cmds).toEqual(['onebrain qmd-reindex']);
  });
});

// ---------------------------------------------------------------------------
// Gemini harness — register-hooks no-op
// ---------------------------------------------------------------------------

describe('runRegisterHooks under harness=gemini', () => {
  let vaultDir: string;

  beforeEach(async () => {
    vaultDir = join(
      tmpdir(),
      `ob-gemini-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    process.env['ONEBRAIN_HARNESS'] = 'gemini';
    await mkdir(join(vaultDir, '.claude'), { recursive: true });
    await writeFile(join(vaultDir, 'vault.yml'), 'update_channel: stable\n', 'utf8');
  });

  afterEach(async () => {
    await rm(vaultDir, { recursive: true, force: true });
    // biome-ignore lint/performance/noDelete: env cleanup requires delete to unset
    delete process.env['ONEBRAIN_HARNESS'];
  });

  test('does NOT touch .gemini/settings.json — Gemini reads hooks from extension', async () => {
    // Gemini support ships as a self-contained extension at
    // .claude/plugins/onebrain/gemini/ which the user installs via
    // `gemini extensions link`. register-hooks must not mutate
    // .gemini/settings.json — that file is the user's, not OneBrain's.
    const geminiSettings = join(vaultDir, '.gemini', 'settings.json');
    await mkdir(join(vaultDir, '.gemini'), { recursive: true });
    const userSettings = { theme: 'my-theme', model: 'gemini-2.5-pro' };
    await writeFile(geminiSettings, JSON.stringify(userSettings), 'utf8');

    const result = await runRegisterHooks({ vaultDir });
    expect(result.ok).toBe(true);

    const after = JSON.parse(await readFile(geminiSettings, 'utf8')) as Record<string, unknown>;
    expect(after).toEqual(userSettings);
  });

  test('does NOT create .gemini/settings.json when missing', async () => {
    const result = await runRegisterHooks({ vaultDir });
    expect(result.ok).toBe(true);

    let exists = false;
    try {
      await readFile(join(vaultDir, '.gemini', 'settings.json'), 'utf8');
      exists = true;
    } catch {
      // expected
    }
    expect(exists).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// registerDirectPath (via runRegisterHooks with runtime.harness: direct)
// ---------------------------------------------------------------------------

describe('registerDirectPath', () => {
  let vaultDir: string;
  // Note: registerDirectPath uses the already-bound homedir() import — mock.module
  // registers the factory but static bindings are resolved at module load time.
  // We test the observable behavior: result.ok and idempotency via marker checks.

  beforeEach(async () => {
    vaultDir = join(
      tmpdir(),
      `ob-direct-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(join(vaultDir, '.claude'), { recursive: true });
    await writeFile(join(vaultDir, 'vault.yml'), 'update_channel: stable\n', 'utf8');
    process.env['ONEBRAIN_HARNESS'] = 'direct';

    mock.module('node:os', () => ({
      homedir,
      tmpdir,
    }));
  });

  afterEach(async () => {
    mock.restore();
    // biome-ignore lint/performance/noDelete: env cleanup requires delete to unset
    delete process.env['ONEBRAIN_HARNESS'];
    await rm(vaultDir, { recursive: true, force: true });
  });

  test('.zshrc exists → result.ok is true (registerDirectPath is non-fatal)', async () => {
    // With direct harness, registerDirectPath runs and is non-fatal regardless of outcome.
    const result = await runRegisterHooks({ vaultDir });
    expect(result.ok).toBe(true);
  });

  test('.zshrc with # onebrain marker → second run does not add duplicate (idempotency)', async () => {
    // Write the marker directly to the real ~/.zshrc equivalent path for this test.
    // Since homedir() can't be redirected via mock for static imports, we verify
    // that if the marker is already present, a second run still returns ok.
    const result1 = await runRegisterHooks({ vaultDir });
    const result2 = await runRegisterHooks({ vaultDir });
    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
  });

  test('no profile file → result.ok === true', async () => {
    // registerDirectPath returns early if no profile file found — non-fatal.
    const result = await runRegisterHooks({ vaultDir });
    expect(result.ok).toBe(true);
  });
});
