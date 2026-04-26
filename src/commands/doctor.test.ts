/**
 * Tests for `onebrain doctor` — runDoctor()
 *
 * All @onebrain/core validators are injected via opts so tests are
 * fast, offline, and deterministic. No mock.module needed.
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
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
    | 'checkHarnessBinaryFn'
    | 'checkQmdEmbeddingsFn'
    | 'checkVersionDriftFn'
    | 'checkOrphanCheckpointsFn'
    | 'checkSandboxFn'
  >
> {
  return {
    checkVaultYmlFn: async () => ({ check: 'vault.yml', status: 'ok', message: 'valid' }),
    loadVaultConfigFn: async () => DEFAULT_CONFIG,
    checkFoldersFn: async () => ({ check: 'folders', status: 'ok', message: '8/8 present' }),
    checkHarnessBinaryFn: async () => ({
      check: 'runtime.harness',
      status: 'ok',
      message: 'claude-code (found)',
    }),
    checkQmdEmbeddingsFn: async () => ({
      check: 'qmd-embeddings',
      status: 'ok',
      message: 'all embedded',
    }),
    checkVersionDriftFn: async () => ({ check: 'version-drift', status: 'ok', message: 'v1.0.0' }),
    checkOrphanCheckpointsFn: async () => ({
      check: 'orphan-checkpoints',
      status: 'ok',
      message: '0 orphans',
    }),
    checkSandboxFn: async () => ({ check: 'sandbox', status: 'ok', message: 'enabled' }),
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
      validators.checkSandboxFn = async () => ({
        check: 'sandbox',
        status: 'warn',
        message: 'disabled',
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

  // ── binaryVersion forwarding ───────────────────────────────────────────────

  describe('binaryVersion forwarding', () => {
    it('forwards binaryVersion to checkVersionDriftFn when provided', async () => {
      let capturedBinaryVersion: string | undefined = 'not-set';
      const validators = makeAllOkValidators();
      validators.checkVersionDriftFn = async (_vaultDir, _config, bv) => {
        capturedBinaryVersion = bv;
        return { check: 'version-drift', status: 'ok', message: 'ok' };
      };

      await runDoctor({ vaultDir: tempDir, isTTY: false, binaryVersion: 'v2.0.0', ...validators });

      expect(capturedBinaryVersion).toBe('v2.0.0');
    });

    it('passes undefined binaryVersion to checkVersionDriftFn when omitted', async () => {
      let capturedBinaryVersion: string | undefined = 'not-set';
      const validators = makeAllOkValidators();
      validators.checkVersionDriftFn = async (_vaultDir, _config, bv) => {
        capturedBinaryVersion = bv;
        return { check: 'version-drift', status: 'ok', message: 'ok' };
      };

      await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });

      expect(capturedBinaryVersion).toBeUndefined();
    });
  });

  // ── Summary line selection ─────────────────────────────────────────────────

  describe('summary line selection', () => {
    it('shows "N errors, N warnings" when both errors and warnings exist', async () => {
      const logLines: string[] = [];
      const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
        logLines.push(msg);
      });
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
        spy.mockRestore();
      }

      expect(logLines.join('\n')).toMatch(/Summary: 1 errors, 1 warnings/);
    });

    it('shows "N errors" (no warnings mention) when only errors', async () => {
      const logLines: string[] = [];
      const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
        logLines.push(msg);
      });
      try {
        const validators = makeAllOkValidators();
        validators.checkVaultYmlFn = async () => ({
          check: 'vault.yml',
          status: 'error',
          message: 'not found',
        });
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      } finally {
        spy.mockRestore();
      }

      const output = logLines.join('\n');
      expect(output).toMatch(/Summary: 1 errors$/m);
      expect(output).not.toMatch(/warnings/);
    });

    it('shows "N warnings — ok to run" when only warnings (no errors)', async () => {
      const logLines: string[] = [];
      const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
        logLines.push(msg);
      });
      try {
        const validators = makeAllOkValidators();
        validators.checkSandboxFn = async () => ({
          check: 'sandbox',
          status: 'warn',
          message: 'disabled',
        });
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });
      } finally {
        spy.mockRestore();
      }

      expect(logLines.join('\n')).toMatch(/Summary: 1 warnings — ok to run/);
    });

    it('shows "All checks passed" when no errors or warnings', async () => {
      const logLines: string[] = [];
      const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
        logLines.push(msg);
      });
      try {
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });
      } finally {
        spy.mockRestore();
      }

      expect(logLines.join('\n')).toMatch(/Summary: All checks passed/);
    });
  });

  // ── TTY vs non-TTY output formatting ──────────────────────────────────────

  describe('TTY vs non-TTY output', () => {
    it('non-TTY: plain title without leading blank line', async () => {
      const logLines: string[] = [];
      const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
        logLines.push(msg);
      });
      try {
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });
      } finally {
        spy.mockRestore();
      }

      expect(logLines.join('\n')).toMatch(/^OneBrain Doctor 🔍/);
    });

    it('TTY: title is padded with surrounding blank lines', async () => {
      const logLines: string[] = [];
      const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
        logLines.push(msg);
      });
      try {
        await runDoctor({ vaultDir: tempDir, isTTY: true, ...makeAllOkValidators() });
      } finally {
        spy.mockRestore();
      }

      const output = logLines.join('\n');
      expect(output).toMatch(/^\n\s+OneBrain Doctor 🔍/);
      expect(output).toMatch(/Summary: All checks passed\n$/);
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
      const logLines: string[] = [];
      const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
        logLines.push(msg);
      });
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
        spy.mockRestore();
      }

      expect(logLines.join('\n')).toContain('→ Run onebrain init to create vault.yml');
    });

    it('does not include a hint line when check has no hint', async () => {
      const logLines: string[] = [];
      const spy = spyOn(console, 'log').mockImplementation((msg: string) => {
        logLines.push(msg);
      });
      try {
        await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });
      } finally {
        spy.mockRestore();
      }

      expect(logLines.join('\n')).not.toContain('→');
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
      validators.checkSandboxFn = async () => ({
        check: 'sandbox',
        status: 'warn',
        message: 'disabled',
      });
      validators.checkHarnessBinaryFn = async () => ({
        check: 'runtime.harness',
        status: 'warn',
        message: 'not found',
      });

      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...validators });

      expect(result.errorCount).toBe(2);
      expect(result.warningCount).toBe(2);
      expect(result.exitCode).toBe(1);
    });

    it('returns errorCount 0 and warningCount 0 when all checks pass', async () => {
      const result = await runDoctor({ vaultDir: tempDir, isTTY: false, ...makeAllOkValidators() });
      expect(result.errorCount).toBe(0);
      expect(result.warningCount).toBe(0);
    });
  });
});
