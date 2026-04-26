/**
 * Unit tests for `onebrain update`
 *
 * Uses injectable dependencies (mock fetch, vault-sync, binary install/validate,
 * register-hooks) so tests run offline and fast.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type UpdateOptions, runUpdate } from './update.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempVault(): Promise<string> {
  const dir = join(
    tmpdir(),
    `onebrain-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, { recursive: true });
  return dir;
}

async function writeVaultYml(vaultDir: string, content: Record<string, unknown>): Promise<void> {
  const { stringify } = await import('yaml');
  await writeFile(join(vaultDir, 'vault.yml'), stringify(content), 'utf8');
}

async function readVaultYml(vaultDir: string): Promise<Record<string, unknown>> {
  const { parse } = await import('yaml');
  const text = await readFile(join(vaultDir, 'vault.yml'), 'utf8');
  return (parse(text) ?? {}) as Record<string, unknown>;
}

/** Build a mock fetch that returns a fake GitHub releases/latest response. */
function makeMockFetch(tagName: string): typeof fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/releases/latest')) {
      return new Response(JSON.stringify({ tag_name: tagName }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  };
}

/** Noop mocks */
const noopVaultSync = async (
  _vaultDir: string,
  _opts: Record<string, unknown>,
): Promise<{ filesAdded: number; filesRemoved: number }> => ({
  filesAdded: 47,
  filesRemoved: 2,
});

const noopInstallBinary = async (_version: string): Promise<void> => {};

const noopValidateBinary = async (): Promise<boolean> => true;

const noopRegisterHooks = async (_vaultDir: string): Promise<void> => {};

let tempDir: string;

beforeEach(async () => {
  tempDir = await makeTempVault();
  await writeVaultYml(tempDir, {
    method: 'onebrain',
    update_channel: 'stable',
    onebrain_version: 'v1.10.18',
  });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runUpdate', () => {
  it('full update — all 6 steps complete and vault.yml updated with new version', async () => {
    const calls: string[] = [];

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        calls.push('vault-sync');
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: async (version) => {
        calls.push(`install:${version}`);
        return noopInstallBinary(version);
      },
      validateBinaryFn: async () => {
        calls.push('validate');
        return true;
      },
      registerHooksFn: async (vaultDir) => {
        calls.push('register-hooks');
        return noopRegisterHooks(vaultDir);
      },
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.latestVersion).toBe('v2.0.0');

    // All steps called in exact order
    expect(calls).toEqual(['vault-sync', 'install:v2.0.0', 'validate', 'register-hooks']);

    // vault.yml updated with new version
    const vaultYml = await readVaultYml(tempDir);
    expect(vaultYml.onebrain_version).toBe('v2.0.0');
  });

  it('--check flag — dry run exits 0, makes no changes', async () => {
    const calls: string[] = [];

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      check: true,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        calls.push('vault-sync');
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: async (version) => {
        calls.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        calls.push('validate');
        return true;
      },
      registerHooksFn: async (vaultDir) => {
        calls.push('register-hooks');
        return noopRegisterHooks(vaultDir);
      },
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.latestVersion).toBe('v2.0.0');

    // No side-effecting steps called
    expect(calls).not.toContain('vault-sync');
    expect(calls).not.toContain('register-hooks');

    // vault.yml not modified
    const vaultYml = await readVaultYml(tempDir);
    expect(vaultYml.onebrain_version).toBe('v1.10.18');
  });

  it('atomic guarantee — validateBinaryFn fails → register-hooks NOT called, exit 1', async () => {
    const calls: string[] = [];

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        calls.push('vault-sync');
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: async (version) => {
        calls.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        calls.push('validate-fail');
        return false; // binary validation fails
      },
      registerHooksFn: async (vaultDir) => {
        calls.push('register-hooks');
        return noopRegisterHooks(vaultDir);
      },
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/Binary validation failed/);

    // validate was called
    expect(calls).toContain('validate-fail');

    // register-hooks was NOT called
    expect(calls).not.toContain('register-hooks');

    // vault.yml NOT updated
    const vaultYml = await readVaultYml(tempDir);
    expect(vaultYml.onebrain_version).toBe('v1.10.18');
  });

  it('GitHub fetch failure → exits 1 with error', async () => {
    const failFetch: typeof fetch = async () =>
      new Response('Service Unavailable', { status: 503 });

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: failFetch,
      vaultSyncFn: noopVaultSync,
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: noopRegisterHooks,
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeDefined();
  });

  it('--channel flag overrides vault.yml update_channel', async () => {
    let syncOptsReceived: Record<string, unknown> = {};

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      channel: 'next',
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        syncOptsReceived = syncOpts;
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: noopRegisterHooks,
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(syncOptsReceived.branch).toBe('next');
  });

  it('non-TTY output format — includes key status lines', async () => {
    const lines: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
      if (typeof chunk === 'string') lines.push(chunk);
      return originalWrite(chunk, ...(args as Parameters<typeof originalWrite>).slice(1));
    };

    try {
      const opts: UpdateOptions = {
        vaultDir: tempDir,
        isTTY: false,
        fetchFn: makeMockFetch('v2.0.0'),
        vaultSyncFn: noopVaultSync,
        installBinaryFn: noopInstallBinary,
        validateBinaryFn: noopValidateBinary,
        registerHooksFn: noopRegisterHooks,
      };
      await runUpdate(opts);
    } finally {
      process.stdout.write = originalWrite;
    }

    const fullOutput = lines.join('');
    expect(fullOutput).toMatch(/OneBrain Update/);
    expect(fullOutput).toMatch(/v2\.0\.0 available/);
    expect(fullOutput).toMatch(/done:/i);
  });

  it('vault.yml missing onebrain_version — shows "unknown" as current', async () => {
    // Write vault.yml without onebrain_version
    await writeVaultYml(tempDir, { method: 'onebrain', update_channel: 'stable' });

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: noopVaultSync,
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: noopRegisterHooks,
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(result.currentVersion).toBe('unknown');
  });

  it('update_channel from vault.yml used when --channel not set', async () => {
    await writeVaultYml(tempDir, {
      method: 'onebrain',
      update_channel: 'next',
      onebrain_version: 'v1.10.18',
    });

    let syncBranchUsed = '';

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        syncBranchUsed = syncOpts.branch as string;
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: noopRegisterHooks,
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    // update_channel 'next' → branch 'next'
    expect(syncBranchUsed).toBe('next');
  });

  it('channel stable resolves to branch main passed to vault-sync', async () => {
    let syncBranchUsed = '';

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      channel: 'stable',
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        syncBranchUsed = syncOpts.branch as string;
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: noopRegisterHooks,
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(syncBranchUsed).toBe('main');
  });

  it('register-hooks failure is non-fatal — vault.yml still updated', async () => {
    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: noopVaultSync,
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: async (_vaultDir) => {
        throw new Error('hooks: permission denied');
      },
    };

    const result = await runUpdate(opts);

    // register-hooks failure is a warning — update still completes
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);

    // vault.yml updated with new version despite hooks failure
    const vaultYml = await readVaultYml(tempDir);
    expect(vaultYml.onebrain_version).toBe('v2.0.0');
  });

  it('binary validation failure → register-hooks NOT called AND vault.yml unchanged', async () => {
    const calls: string[] = [];

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        calls.push('vault-sync');
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: async (version) => {
        calls.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        calls.push('validate-fail');
        return false;
      },
      registerHooksFn: async (vaultDir) => {
        calls.push('register-hooks');
        return noopRegisterHooks(vaultDir);
      },
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);

    // register-hooks was NOT called
    expect(calls).not.toContain('register-hooks');

    // vault.yml unchanged
    const vaultYml = await readVaultYml(tempDir);
    expect(vaultYml.onebrain_version).toBe('v1.10.18');
  });

  it('vault.yml missing → exits 1 with clear error before any network call', async () => {
    // Use a directory with no vault.yml
    const emptyDir = join(
      tmpdir(),
      `onebrain-update-test-novault-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await mkdir(emptyDir, { recursive: true });

    let fetchCalled = false;
    const opts: UpdateOptions = {
      vaultDir: emptyDir,
      isTTY: false,
      fetchFn: async (...args) => {
        fetchCalled = true;
        return makeMockFetch('v2.0.0')(...args);
      },
      vaultSyncFn: noopVaultSync,
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: noopRegisterHooks,
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/vault\.yml not found/);
    expect(fetchCalled).toBe(false); // guard fires before fetch

    await rm(emptyDir, { recursive: true, force: true });
  });

  it('same version — vault-sync runs, binary install skipped', async () => {
    // Set vault.yml currentVersion to match latestVersion
    await writeVaultYml(tempDir, {
      method: 'onebrain',
      update_channel: 'stable',
      onebrain_version: 'v2.0.0',
    });

    const calls: string[] = [];

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        calls.push('vault-sync');
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: async (version) => {
        calls.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        calls.push('validate');
        return true;
      },
      registerHooksFn: async (vaultDir) => {
        calls.push('register-hooks');
        return noopRegisterHooks(vaultDir);
      },
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(result.latestVersion).toBe('v2.0.0');
    expect(result.currentVersion).toBe('v2.0.0');

    // vault-sync ran; binary install did NOT
    expect(calls).toContain('vault-sync');
    expect(calls).not.toContain('install:v2.0.0');

    // validate and register-hooks still ran
    expect(calls).toContain('validate');
    expect(calls).toContain('register-hooks');
  });

  it('different versions — binary install IS called', async () => {
    // tempDir already has onebrain_version: 'v1.10.18', latest is 'v2.0.0'
    const calls: string[] = [];

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        calls.push('vault-sync');
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: async (version) => {
        calls.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        calls.push('validate');
        return true;
      },
      registerHooksFn: async (vaultDir) => {
        calls.push('register-hooks');
        return noopRegisterHooks(vaultDir);
      },
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(calls).toContain('install:v2.0.0'); // binary install called
  });
});
