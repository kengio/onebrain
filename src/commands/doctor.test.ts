/**
 * Tests for `onebrain doctor` — runDoctor()
 *
 * All @onebrain/core validators are injected via opts so tests are
 * fast, offline, and deterministic. No mock.module needed.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { VaultConfig } from '../lib/index.js';
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

      expect(outputChunks.join('')).toMatch(/Summary: 1 errors, 1 warnings/);
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
      expect(output).toMatch(/Summary: 1 errors, 0 warnings/m);
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

      expect(outputChunks.join('')).toMatch(/Summary: 1 warnings — ok to run/);
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

      expect(outputChunks.join('')).toMatch(/Summary: All checks passed/);
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
});
