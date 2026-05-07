/**
 * Tests for `onebrain doctor` — runDoctor()
 *
 * All @onebrain/core validators are injected via opts so tests are
 * fast, offline, and deterministic. No mock.module needed.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import {
  DEFAULT_CHECKPOINT,
  type VaultConfig,
  checkClaudeSettings,
  checkVaultYmlKeys,
} from '../lib/index.js';
import { type DoctorOptions, runDoctor } from './doctor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempVault(): Promise<string> {
  const dir = join(
    tmpdir(),
    `onebrain-doctor-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

const DEFAULT_CONFIG: VaultConfig = {
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
  checkpoint: { ...DEFAULT_CHECKPOINT },
};

function makeAllOkValidators(): Required<
  Pick<
    DoctorOptions,
    | 'checkVaultYmlFn'
    | 'loadVaultConfigFn'
    | 'checkFoldersFn'
    | 'checkQmdEmbeddingsFn'
    | 'checkOrphanCheckpointsFn'
    | 'checkPluginFilesFn'
    | 'checkVaultYmlKeysFn'
    | 'checkSettingsHooksFn'
    | 'checkClaudeSettingsFn'
  >
> {
  return {
    checkVaultYmlFn: async () => ({ check: 'vault.yml', status: 'ok', message: 'valid' }),
    loadVaultConfigFn: async () => DEFAULT_CONFIG,
    checkFoldersFn: async () => ({ check: 'folders', status: 'ok', message: '8/8 present' }),
    checkQmdEmbeddingsFn: async () => ({
      check: 'qmd-embeddings',
      status: 'ok',
      message: 'all embedded',
    }),
    checkOrphanCheckpointsFn: async () => ({
      check: 'orphan-checkpoints',
      status: 'ok',
      message: '0 orphans',
    }),
    checkPluginFilesFn: async () => ({
      check: 'plugin-files',
      status: 'ok',
      message: 'all present',
    }),
    checkVaultYmlKeysFn: async () => ({
      check: 'vault.yml-keys',
      status: 'ok',
      message: 'all keys valid',
    }),
    checkSettingsHooksFn: async () => ({
      check: 'settings-hooks',
      status: 'ok',
      message: 'all hooks registered',
    }),
    checkClaudeSettingsFn: async () => ({ check: 'claude-settings', status: 'ok', message: 'ok' }),
  };
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

describe('runDoctor', () => {
  // ── Exit codes ─────────────────────────────────────────────────────────────

  describe('exit codes', () => {
    it('returns exitCode 1 when any check returns status error', async () => {
      const validators = makeAllOkValidators();
      validators.checkVaultYmlFn = async () => ({
        check: 'vault.yml',
        status: 'error',
        message: 'not found',
      });

      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });

      expect(result.exitCode).toBe(1);
      expect(result.ok).toBe(false);
      expect(result.errorCount).toBeGreaterThanOrEqual(1);
    });

    it('returns exitCode 0 when checks return only warnings (no errors)', async () => {
      const validators = makeAllOkValidators();
      validators.checkFoldersFn = async () => ({
        check: 'folders',
        status: 'warn',
        message: '7/8 present',
      });
      validators.checkOrphanCheckpointsFn = async () => ({
        check: 'orphan-checkpoints',
        status: 'warn',
        message: '2 unmerged checkpoint(s)',
      });

      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });

      expect(result.exitCode).toBe(0);
      expect(result.ok).toBe(true);
      expect(result.warningCount).toBeGreaterThanOrEqual(2);
      expect(result.errorCount).toBe(0);
    });

    it('returns exitCode 0 when all checks pass', async () => {
      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });

      expect(result.exitCode).toBe(0);
      expect(result.ok).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
    });
  });

  // ── Summary line selection ─────────────────────────────────────────────────

  describe('summary line selection', () => {
    it('shows "N errors, N warnings" when both errors and warnings exist', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        const validators = makeAllOkValidators();
        validators.checkVaultYmlFn = async () => ({
          check: 'vault.yml',
          status: 'error',
          message: 'not found',
        });
        validators.checkFoldersFn = async () => ({
          check: 'folders',
          status: 'warn',
          message: '7/8 present',
        });
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      } finally {
        process.stdout.write = originalWrite;
      }

      expect(outputChunks.join('')).toMatch(/Summary: \d+ checks · 1 error\(s\) · 1 warning\(s\)/);
    });

    it('shows "N errors, N warnings" summary when only errors exist', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        const validators = makeAllOkValidators();
        validators.checkVaultYmlFn = async () => ({
          check: 'vault.yml',
          status: 'error',
          message: 'not found',
        });
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      } finally {
        process.stdout.write = originalWrite;
      }

      const output = outputChunks.join('');
      expect(output).toMatch(/Summary: \d+ checks · 1 error\(s\)/m);
    });

    it('shows "N warnings — ok to run" when only warnings (no errors)', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        const validators = makeAllOkValidators();
        validators.checkOrphanCheckpointsFn = async () => ({
          check: 'orphan-checkpoints',
          status: 'warn',
          message: '1 unmerged checkpoint(s)',
        });
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      } finally {
        process.stdout.write = originalWrite;
      }

      expect(outputChunks.join('')).toMatch(/Summary: \d+ checks · 1 warning\(s\) — ok to run/);
    });

    it('shows "All checks passed" when no errors or warnings', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });
      } finally {
        process.stdout.write = originalWrite;
      }

      expect(outputChunks.join('')).toMatch(/Summary: \d+ checks — all passed/);
    });
  });

  // ── TTY vs non-TTY output formatting ──────────────────────────────────────

  describe('TTY vs non-TTY output', () => {
    it('non-TTY: plain title present in output', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });
      } finally {
        process.stdout.write = originalWrite;
      }

      expect(outputChunks.join('')).toMatch(/OneBrain Doctor/);
    });

    it('TTY: runDoctor completes with exitCode 0 when all checks pass', async () => {
      // In TTY mode, summary goes through clack outro() which bypasses console.log.
      // We verify the return value instead of capturing console output.
      const result = await runDoctor({
        vaultDir: tempDir,
        isTTY: true,
        delayFn: async () => {},
        ...makeAllOkValidators(),
      });
      expect(result.exitCode).toBe(0);
      expect(result.ok).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
    });
  });

  // ── loadVaultConfig failure resilience ────────────────────────────────────

  describe('loadVaultConfig failure resilience', () => {
    it('continues with default config when loadVaultConfigFn throws after valid vault.yml', async () => {
      let foldersConfigReceived: VaultConfig | undefined;
      const validators = makeAllOkValidators();
      validators.checkVaultYmlFn = async () => ({
        check: 'vault.yml',
        status: 'ok',
        message: 'valid',
      });
      validators.loadVaultConfigFn = async () => {
        throw new Error('parse error');
      };
      validators.checkFoldersFn = async (_vaultDir, config) => {
        foldersConfigReceived = config;
        return { check: 'folders', status: 'ok', message: '8/8 present' };
      };

      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });

      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(foldersConfigReceived?.folders.inbox).toBe('00-inbox');
      expect(foldersConfigReceived?.folders.logs).toBe('07-logs');
    });

    it('skips loadVaultConfigFn when checkVaultYml returns error', async () => {
      let loadCalled = false;
      const validators = makeAllOkValidators();
      validators.checkVaultYmlFn = async () => ({
        check: 'vault.yml',
        status: 'error',
        message: 'not found',
      });
      validators.loadVaultConfigFn = async () => {
        loadCalled = true;
        return DEFAULT_CONFIG;
      };

      await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });

      expect(loadCalled).toBe(false);
    });
  });

  // ── Hint lines ────────────────────────────────────────────────────────────

  describe('hint lines', () => {
    it('includes hint line in output when a check returns a hint', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        const validators = makeAllOkValidators();
        validators.checkVaultYmlFn = async () => ({
          check: 'vault.yml',
          status: 'error',
          message: 'vault.yml not found',
          hint: 'Run onebrain init to create vault.yml',
        });
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      } finally {
        process.stdout.write = originalWrite;
      }

      expect(outputChunks.join('')).toContain('→ Run onebrain init to create vault.yml');
    });

    it('does not include a hint line when check has no hint', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });
      } finally {
        process.stdout.write = originalWrite;
      }

      expect(outputChunks.join('')).not.toContain('→');
    });
  });

  // ── Unicode symbol preservation ───────────────────────────────────────────

  describe('unicode symbol preservation', () => {
    it('ok status icon [✓] is present in output and survives UTF-8 encode → decode', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });
      } finally {
        process.stdout.write = originalWrite;
      }

      const output = outputChunks.join('');
      expect(output).toContain('[✓]');

      // Round-trip: the output must survive UTF-8 encode → decode without data loss
      const encoded = new TextEncoder().encode(output);
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(encoded);
      expect(decoded).toBe(output);
    });

    it('error status icon [✗] and warn icon [!] are present in output', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        const validators = makeAllOkValidators();
        validators.checkVaultYmlFn = async () => ({
          check: 'vault.yml',
          status: 'error',
          message: 'not found',
        });
        validators.checkFoldersFn = async () => ({
          check: 'folders',
          status: 'warn',
          message: '7/8 present',
        });
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      } finally {
        process.stdout.write = originalWrite;
      }

      const output = outputChunks.join('');
      expect(output).toContain('[✗]');
      expect(output).toContain('[!]');
    });

    it('hint arrow → is preserved in output UTF-8 round-trip', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        const validators = makeAllOkValidators();
        validators.checkVaultYmlFn = async () => ({
          check: 'vault.yml',
          status: 'error',
          message: 'vault.yml not found',
          hint: 'Run onebrain init to create vault.yml',
        });
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      } finally {
        process.stdout.write = originalWrite;
      }

      const output = outputChunks.join('');
      expect(output).toContain('→');

      // The → arrow must survive a UTF-8 encode → decode round-trip
      const encoded = new TextEncoder().encode(output);
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(encoded);
      expect(decoded).toBe(output);
    });

    it('non-TTY output is valid UTF-8 (round-trip)', async () => {
      const outputChunks: string[] = [];
      const originalWrite = process.stdout.write.bind(process.stdout);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stdout as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') outputChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });
      } finally {
        process.stdout.write = originalWrite;
      }

      const output = outputChunks.join('');
      const encoded = new TextEncoder().encode(output);
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(encoded);
      expect(decoded).toBe(output);
    });
  });

  // ── errorCount / warningCount accuracy ────────────────────────────────────

  describe('result counts', () => {
    it('accurately counts multiple errors and warnings across all checks', async () => {
      const validators = makeAllOkValidators();
      validators.checkVaultYmlFn = async () => ({
        check: 'vault.yml',
        status: 'error',
        message: 'not found',
      });
      validators.checkFoldersFn = async () => ({
        check: 'folders',
        status: 'error',
        message: '0/8 present',
      });
      validators.checkOrphanCheckpointsFn = async () => ({
        check: 'orphan-checkpoints',
        status: 'warn',
        message: '1 unmerged checkpoint(s)',
      });

      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });

      expect(result.errorCount).toBe(2);
      expect(result.warningCount).toBe(1);
      expect(result.exitCode).toBe(1);
    });

    it('returns errorCount 0 and warningCount 0 when all checks pass', async () => {
      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
    });
  });

  // ── --fix flag ─────────────────────────────────────────────────────────────

  describe('fix flag', () => {
    it('fix: all checks pass → nothing to fix (non-TTY)', async () => {
      const registerHooksCalled = { called: false };
      const result = await runDoctor({
        vaultDir: tempDir,
        isTTY: false,
        fix: true,
        ...makeAllOkValidators(),
        registerHooksFn: async (_vaultDir) => {
          registerHooksCalled.called = true;
        },
      });

      expect(result.ok).toBe(true);
      expect(result.errorCount).toBe(0);
      // registerHooks should NOT be called (nothing to fix)
      expect(registerHooksCalled.called).toBe(false);
    });

    it('fix: settings-hooks warn → registerHooksFn called (non-TTY)', async () => {
      const registerHooksCalled = { called: false };

      const result = await runDoctor({
        vaultDir: tempDir,
        isTTY: false,
        fix: true,
        ...makeAllOkValidators(),
        checkSettingsHooksFn: async () => ({
          check: 'settings-hooks',
          status: 'warn',
          message: 'SessionStart hook missing',
          hint: 'Run onebrain doctor --fix',
        }),
        registerHooksFn: async (_vaultDir) => {
          registerHooksCalled.called = true;
        },
      });

      expect(result.ok).toBe(true); // warn doesn't make ok=false
      expect(registerHooksCalled.called).toBe(true);
    });
  });

  // ── new checks contribute to counts ───────────────────────────────────────

  describe('new checks count contribution', () => {
    it('new checks (plugin-files, vault.yml-keys, settings-hooks) contribute to error/warning counts', async () => {
      const result = await runDoctor({
        vaultDir: tempDir,
        isTTY: false,
        ...makeAllOkValidators(),
        checkPluginFilesFn: async () => ({
          check: 'plugin-files',
          status: 'error',
          message: 'missing: INSTRUCTIONS.md',
        }),
        checkVaultYmlKeysFn: async () => ({
          check: 'vault.yml-keys',
          status: 'warn',
          message: 'deprecated key: onebrain_version',
        }),
        checkSettingsHooksFn: async () => ({
          check: 'settings-hooks',
          status: 'ok',
          message: 'hooks ok',
        }),
      });

      expect(result.errorCount).toBe(1);
      expect(result.warningCount).toBe(1);
      expect(result.ok).toBe(false);
    });
  });

  // ── #133: missing update_channel → warning + auto-fix ────────────────────

  describe('vault.yml missing update_channel (#133)', () => {
    it('emits warning (not error) when only update_channel is missing; --fix backfills "stable"', async () => {
      // Real vault.yml on disk so checkVaultYmlKeys + getFix both touch real files.
      const vaultYmlPath = join(tempDir, 'vault.yml');
      await writeFile(
        vaultYmlPath,
        `folders:
  inbox: 00-inbox
  projects: 01-projects
  areas: 02-areas
  knowledge: 03-knowledge
  resources: 04-resources
  agent: 05-agent
  archive: 06-archive
  logs: 07-logs
`,
        'utf8',
      );

      // 1. Validator: warning, not error
      const validators = makeAllOkValidators();
      validators.checkVaultYmlKeysFn = checkVaultYmlKeys;

      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });

      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(1);

      // 2. --fix runs and writes update_channel: stable
      await runDoctor({
        vaultDir: tempDir,
        isTTY: false,
        fix: true,
        ...validators,
      });

      const after = parseYaml(await readFile(vaultYmlPath, 'utf8')) as Record<string, unknown>;
      expect(after['update_channel']).toBe('stable');

      // Idempotency: second --fix run produces byte-identical vault.yml.
      const firstBytes = await readFile(vaultYmlPath, 'utf8');
      await runDoctor({
        vaultDir: tempDir,
        isTTY: false,
        fix: true,
        ...validators,
      });
      const secondBytes = await readFile(vaultYmlPath, 'utf8');
      expect(secondBytes).toBe(firstBytes);
    });

    // Defense in depth (#7): the validator must propagate `missing key:
    // update_channel` into result.details — otherwise downstream getFix() at
    // doctor.ts (which checks r.details.some(...)) silently no-ops.
    it('checkVaultYmlKeys exposes "missing key: update_channel" in details when only that key is absent', async () => {
      const vaultYmlPath = join(tempDir, 'vault.yml');
      await writeFile(
        vaultYmlPath,
        `folders:
  inbox: 00-inbox
  projects: 01-projects
  areas: 02-areas
  knowledge: 03-knowledge
  resources: 04-resources
  agent: 05-agent
  archive: 06-archive
  logs: 07-logs
`,
        'utf8',
      );

      const r = await checkVaultYmlKeys(tempDir);
      expect(r.status).toBe('warn');
      expect(r.details).toBeDefined();
      expect(r.details).toContain('missing key: update_channel');
    });
  });

  // ── stale extraKnownMarketplaces.onebrain.source.repo → warn + auto-fix ──

  describe('stale extraKnownMarketplaces.onebrain.source.repo', () => {
    it('emits warning when stale repo present; --fix rewrites to canonical', async () => {
      // Vault-level settings.json: <tempDir>/.claude/settings.json with stale repo
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      const initialContent = `${JSON.stringify(
        {
          extraKnownMarketplaces: {
            onebrain: {
              source: { repo: 'kengio/onebrain' },
            },
          },
        },
        null,
        2,
      )}\n`;
      await writeFile(settingsPath, initialContent, 'utf8');

      const validators = makeAllOkValidators();
      // Real implementation reads vault-level settings.json
      validators.checkClaudeSettingsFn = (vaultDir) => checkClaudeSettings(vaultDir);

      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });

      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(1);

      // --fix rewrites
      await runDoctor({ vaultDir: tempDir, isTTY: false, fix: true, ...validators });

      const after = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<string, unknown>;
      const repo = (
        (
          (after['extraKnownMarketplaces'] as Record<string, unknown>)?.['onebrain'] as Record<
            string,
            unknown
          >
        )?.['source'] as Record<string, unknown>
      )?.['repo'];
      expect(repo).toBe('onebrain-ai/onebrain');

      // Trailing newline preserved
      expect((await readFile(settingsPath, 'utf8')).endsWith('\n')).toBe(true);

      // Idempotent: second --fix run is a no-op (file content unchanged)
      const beforeSecond = await readFile(settingsPath, 'utf8');
      await runDoctor({ vaultDir: tempDir, isTTY: false, fix: true, ...validators });
      const afterSecond = await readFile(settingsPath, 'utf8');
      expect(afterSecond).toBe(beforeSecond);
    });

    it('malformed JSON in [vault]/.claude/settings.json → warn, no throw', async () => {
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      await writeFile(settingsPath, '{not json', 'utf8');

      const r = await checkClaudeSettings(tempDir);
      expect(r.status).toBe('warn');
      expect(r.message.toLowerCase()).toContain('json');

      // runDoctor (full pipeline) must not crash either
      const validators = makeAllOkValidators();
      validators.checkClaudeSettingsFn = (vaultDir) => checkClaudeSettings(vaultDir);
      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── #5: fixFailedCount + exit code propagation ───────────────────────────

  describe('--fix failure propagation', () => {
    it('fix that throws → fixFailedCount === 1, exitCode 1, ok false', async () => {
      // Unix-only: relies on POSIX ENOTDIR semantics for mkdir-under-regular-file.
      // Windows surfaces a different errno and the trick isn't reliable there.
      if (process.platform === 'win32') return;

      // Set up: a missing-folder warning that will trigger getFix(), but the
      // fix's mkdir will fail because we point at an unwritable parent.
      const validators = makeAllOkValidators();
      validators.checkFoldersFn = async () => ({
        check: 'folders',
        status: 'error',
        message: '0/8 present',
        hint: 'Missing: 00-inbox',
        details: ['missing: 00-inbox'],
      });

      // Run --fix against a NON-EXISTENT vaultDir so mkdir fails
      // (parent doesn't exist, recursive: true still succeeds — instead use a
      // path component that's a regular file so mkdir errors with ENOTDIR).
      const blockerFile = join(tempDir, 'blocker');
      await writeFile(blockerFile, 'not-a-dir', 'utf8');
      const blockedVault = join(blockerFile, 'sub-vault');

      const result = await runDoctor({
        vaultDir: blockedVault,
        isTTY: false,
        fix: true,
        ...validators,
      });

      expect(result.fixFailedCount).toBe(1);
      expect(result.exitCode).toBe(1);
      expect(result.ok).toBe(false);
    });

    it('fix that succeeds → fixFailedCount === 0', async () => {
      const validators = makeAllOkValidators();
      validators.checkFoldersFn = async () => ({
        check: 'folders',
        status: 'error',
        message: '0/1 present',
        hint: 'Missing: 00-inbox',
        details: ['missing: 00-inbox'],
      });

      const result = await runDoctor({
        vaultDir: tempDir,
        isTTY: false,
        fix: true,
        ...validators,
      });

      expect(result.fixFailedCount).toBe(0);
      // Original folders check was an error → exitCode 1 still applies
      expect(result.errorCount).toBe(1);
    });
  });

  // ── #6: loadVaultConfig non-ENOENT error surfaces to stderr ──────────────

  describe('loadVaultConfig error surfacing', () => {
    it('non-ENOENT loadVaultConfig error writes warning to stderr; ENOENT stays silent', async () => {
      const stderrChunks: string[] = [];
      const originalWrite = process.stderr.write.bind(process.stderr);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stderr as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') stderrChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        const validators = makeAllOkValidators();
        validators.loadVaultConfigFn = async () => {
          throw new Error('parse error: unexpected token at line 3');
        };
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      } finally {
        process.stderr.write = originalWrite;
      }

      expect(stderrChunks.join('')).toContain('doctor: vault.yml load warning:');
      expect(stderrChunks.join('')).toContain('parse error');
    });

    it('ENOENT loadVaultConfig error is silent (first-run path)', async () => {
      const stderrChunks: string[] = [];
      const originalWrite = process.stderr.write.bind(process.stderr);
      // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
      (process.stderr as any).write = (chunk: string | Uint8Array, ...args: unknown[]): boolean => {
        if (typeof chunk === 'string') stderrChunks.push(chunk);
        return originalWrite(
          chunk as string,
          ...(args as [BufferEncoding?, ((err?: Error | null) => void)?]),
        );
      };
      try {
        const validators = makeAllOkValidators();
        validators.loadVaultConfigFn = async () => {
          const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
          err.code = 'ENOENT';
          throw err;
        };
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      } finally {
        process.stderr.write = originalWrite;
      }

      expect(stderrChunks.join('')).not.toContain('vault.yml load warning');
    });
  });

  // ── #6: end-to-end smoke — 3 drifts at once ──────────────────────────────

  describe('end-to-end: 3 drifts in one --fix pass', () => {
    it('missing update_channel + deprecated key + stale marketplace repo all auto-fix in one run', async () => {
      // 1. vault.yml: missing update_channel + deprecated `method:` key
      const vaultYmlPath = join(tempDir, 'vault.yml');
      await writeFile(
        vaultYmlPath,
        `method: legacy
folders:
  inbox: 00-inbox
  projects: 01-projects
  areas: 02-areas
  knowledge: 03-knowledge
  resources: 04-resources
  agent: 05-agent
  archive: 06-archive
  logs: 07-logs
`,
        'utf8',
      );

      // 2. [vault]/.claude/settings.json: stale marketplace repo
      await mkdir(join(tempDir, '.claude'), { recursive: true });
      const settingsPath = join(tempDir, '.claude', 'settings.json');
      const stale = `${JSON.stringify(
        {
          extraKnownMarketplaces: {
            onebrain: { source: { repo: 'kengio/onebrain' } },
          },
        },
        null,
        2,
      )}\n`;
      await writeFile(settingsPath, stale, 'utf8');

      const validators = makeAllOkValidators();
      validators.checkVaultYmlKeysFn = checkVaultYmlKeys;
      validators.checkClaudeSettingsFn = (vaultDir) => checkClaudeSettings(vaultDir);

      // Pre-fix: at least 2 warnings (vault.yml-keys covers both update_channel
      // missing + deprecated method: under one check; claude-settings is the 2nd).
      const pre = await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      expect(pre.warningCount).toBeGreaterThanOrEqual(2);

      // --fix all
      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, fix: true, ...validators });
      expect(result.fixFailedCount).toBe(0);
      expect(result.errorCount).toBe(0);

      // Each file shows the expected post-fix state.
      const vaultAfter = parseYaml(await readFile(vaultYmlPath, 'utf8')) as Record<string, unknown>;
      expect(vaultAfter['update_channel']).toBe('stable');
      expect(vaultAfter['method']).toBeUndefined();

      const settingsAfter = JSON.parse(await readFile(settingsPath, 'utf8')) as Record<
        string,
        unknown
      >;
      const repo = (
        (
          (settingsAfter['extraKnownMarketplaces'] as Record<string, unknown>)?.[
            'onebrain'
          ] as Record<string, unknown>
        )?.['source'] as Record<string, unknown>
      )?.['repo'];
      expect(repo).toBe('onebrain-ai/onebrain');

      // Re-run doctor (no --fix): post-fix vault is healthy on these dimensions.
      const post = await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      expect(post.errorCount).toBe(0);
      // No warning should match any of the 3 drift signatures.
      const warnTexts: string[] = [];
      // We don't have direct access to results, so re-run the validators that we
      // used for the drifts and assert they're 'ok' now.
      const ymlKeys = await checkVaultYmlKeys(tempDir);
      const claude = await checkClaudeSettings(tempDir);
      warnTexts.push(JSON.stringify(ymlKeys));
      warnTexts.push(JSON.stringify(claude));
      expect(ymlKeys.status).toBe('ok');
      expect(claude.status).toBe('ok');
    });
  });
});
