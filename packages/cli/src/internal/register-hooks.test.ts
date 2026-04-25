/**
 * Integration tests for register-hooks
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRegisterHooks } from './register-hooks';

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
  test('fresh run on empty settings — all hooks registered, PATH set, 3 permissions added', async () => {
    const result = await runRegisterHooks({ vaultDir: tempDir });

    expect(result.ok).toBe(true);

    // All 4 hooks should be added
    for (const event of ['Stop', 'PreCompact', 'PostCompact', 'SessionStart']) {
      expect(result.hooks[event]).toBe('added');
    }

    // PATH should be updated
    expect(result.pathStatus).toBe('updated');

    // 3 permissions added
    expect(result.permissionsAdded).toHaveLength(3);
    expect(result.permissionsAdded).toContain('Bash(onebrain:*)');
    expect(result.permissionsAdded).toContain('Bash(bun install -g @onebrain/cli:*)');
    expect(result.permissionsAdded).toContain('Bash(npm install -g @onebrain/cli:*)');

    // Verify written file structure
    const settings = await readSettingsFile(tempDir);
    const hooks = settings.hooks as Record<string, unknown[]>;
    expect(Object.keys(hooks)).toHaveLength(4);

    const perms = (settings.permissions as { allow: string[] }).allow;
    expect(perms).toHaveLength(3);
  });

  test('idempotent re-run — nothing changes', async () => {
    // First run
    await runRegisterHooks({ vaultDir: tempDir });

    // Second run
    const result = await runRegisterHooks({ vaultDir: tempDir });

    expect(result.ok).toBe(true);

    for (const event of ['Stop', 'PreCompact', 'PostCompact', 'SessionStart']) {
      expect(result.hooks[event]).toBe('ok');
    }

    expect(result.pathStatus).toBe('ok');
    expect(result.permissionsAdded).toHaveLength(0);
  });

  test('idempotent re-run with shell-literal PATH forms — no duplicate entries', async () => {
    // Pre-seed settings with shell-literal PATH forms
    const settingsPath = join(tempDir, '.claude', 'settings.json');
    await writeFile(
      settingsPath,
      JSON.stringify({
        env: {
          PATH: '$HOME/.bun/bin:$HOME/.npm-global/bin:${PATH}',
        },
      }),
      'utf8',
    );

    const result = await runRegisterHooks({ vaultDir: tempDir });

    expect(result.ok).toBe(true);
    expect(result.pathStatus).toBe('ok');

    // PATH should not have been modified (no duplicate absolute paths appended)
    const settings = await readSettingsFile(tempDir);
    const envPath = (settings.env as { PATH: string }).PATH;
    expect(envPath).toBe('$HOME/.bun/bin:$HOME/.npm-global/bin:${PATH}');
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
    expect(result.hooks.Stop).toBe('migrated');

    // Verify the migration was written
    const settings = await readSettingsFile(tempDir);
    const stopGroups = (settings.hooks as Record<string, { hooks: { command: string }[] }[]>).Stop;
    const commands = stopGroups.flatMap((g) => g.hooks.map((h) => h.command));
    expect(commands).toContain('onebrain checkpoint stop');
    expect(commands.some((c) => c.includes('checkpoint-hook.sh'))).toBe(false);
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
