/**
 * Integration tests for `updateCommand` / `runUpdate` (the CLI entry point).
 *
 * Exercises the update flow using injectable mock dependencies so tests run
 * offline and fast. Focuses on scenarios not already covered by update.test.ts:
 * - --check dry-run mode output and no-side-effects guarantee
 * - graceful network failure (fetch throws instead of returning error status)
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
    `onebrain-update-int-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
  const fn = async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/releases/latest')) {
      return new Response(
        JSON.stringify({ tag_name: tagName, published_at: '2026-04-24T00:00:00Z' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
    return new Response('Not Found', { status: 404 });
  };
  return fn as typeof fetch;
}

/** Mock fetch that throws (simulates network unavailable). */
function makeThrowingFetch(): typeof fetch {
  const fn = async (_input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    throw new Error('fetch failed: network unavailable');
  };
  return fn as typeof fetch;
}
const throwingFetch = makeThrowingFetch();

/** Noop mocks with required return shapes. */
const noopVaultSync = async (
  _vaultDir: string,
  _opts: Record<string, unknown>,
): Promise<{ filesAdded: number; filesRemoved: number }> => ({ filesAdded: 0, filesRemoved: 0 });

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
// --check dry-run integration scenario
// ---------------------------------------------------------------------------

describe('update integration: --check dry-run mode', () => {
  it('reports what would change (latestVersion) without downloading or modifying files', async () => {
    const sideEffects: string[] = [];

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      check: true,
      fetchFn: makeMockFetch('v1.99.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        sideEffects.push('vault-sync');
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: async (version) => {
        sideEffects.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        sideEffects.push('validate');
        return true;
      },
      registerHooksFn: async (vaultDir) => {
        sideEffects.push('register-hooks');
        return noopRegisterHooks(vaultDir);
      },
    };

    const result = await runUpdate(opts);

    // Command succeeds
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);

    // Reports the available version
    expect(result.latestVersion).toBe('v1.99.0');
    expect(result.currentVersion).toBe('v1.10.18');

    // No side-effecting steps called
    expect(sideEffects).not.toContain('vault-sync');
    expect(sideEffects).not.toContain('register-hooks');
    expect(sideEffects).toHaveLength(0);
  });

  it('vault.yml is not modified by dry-run', async () => {
    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      check: true,
      fetchFn: makeMockFetch('v1.99.0'),
      vaultSyncFn: noopVaultSync,
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: noopRegisterHooks,
    };

    await runUpdate(opts);

    // vault.yml onebrain_version unchanged
    const vaultYml = await readVaultYml(tempDir);
    expect(vaultYml['onebrain_version']).toBe('v1.10.18');
  });

  it('result carries both current and latest version in dry-run mode', async () => {
    const result = await runUpdate({
      vaultDir: tempDir,
      isTTY: false,
      check: true,
      fetchFn: makeMockFetch('v1.99.0'),
      vaultSyncFn: noopVaultSync,
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: noopRegisterHooks,
    });

    // Both versions available on the result object
    expect(result.latestVersion).toBe('v1.99.0');
    expect(result.currentVersion).toBe('v1.10.18');
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Network failure integration scenario
// ---------------------------------------------------------------------------

describe('update integration: network unavailable (fetch throws)', () => {
  it('exits with clear error message when fetch throws, does not crash', async () => {
    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: throwingFetch,
      vaultSyncFn: noopVaultSync,
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: noopRegisterHooks,
    };

    // Should resolve (not throw) — errors go to result, not thrown
    const result = await runUpdate(opts);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeDefined();
    // Error should be descriptive
    expect(result.error).toMatch(/Fetch failed/i);
  });

  it('vault.yml unchanged when network fails', async () => {
    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: throwingFetch,
      vaultSyncFn: noopVaultSync,
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      registerHooksFn: noopRegisterHooks,
    };

    await runUpdate(opts);

    const vaultYml = await readVaultYml(tempDir);
    expect(vaultYml['onebrain_version']).toBe('v1.10.18');
  });
});

// ---------------------------------------------------------------------------
// Full end-to-end success scenario
// ---------------------------------------------------------------------------

describe('update integration: full end-to-end success', () => {
  it('all 6 steps complete, vault.yml gets updated version, registerHooks is called', async () => {
    const sideEffects: string[] = [];

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        sideEffects.push('vault-sync');
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: async (version) => {
        sideEffects.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        sideEffects.push('validate');
        return true;
      },
      registerHooksFn: async (vaultDir) => {
        sideEffects.push('register-hooks');
        return noopRegisterHooks(vaultDir);
      },
    };

    const result = await runUpdate(opts);

    // Result is success
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.latestVersion).toBe('v2.0.0');
    expect(result.currentVersion).toBe('v1.10.18');

    // All side-effecting steps were called
    expect(sideEffects).toContain('vault-sync');
    expect(sideEffects).toContain('install:v2.0.0');
    expect(sideEffects).toContain('validate');
    expect(sideEffects).toContain('register-hooks');

    // vault.yml has the new version
    const vaultYml = await readVaultYml(tempDir);
    expect(vaultYml['onebrain_version']).toBe('v2.0.0');
  });
});

// ---------------------------------------------------------------------------
// Atomic gate: validateBinary returns false → registerHooks must NOT be called
// ---------------------------------------------------------------------------

describe('update integration: atomic gate (validateBinary returns false)', () => {
  it('registerHooks is NOT called when validateBinary returns false', async () => {
    const sideEffects: string[] = [];

    const opts: UpdateOptions = {
      vaultDir: tempDir,
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      vaultSyncFn: async (vaultDir, syncOpts) => {
        sideEffects.push('vault-sync');
        return noopVaultSync(vaultDir, syncOpts);
      },
      installBinaryFn: async (version) => {
        sideEffects.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        sideEffects.push('validate');
        return false; // ATOMIC GATE: validation fails
      },
      registerHooksFn: async (vaultDir) => {
        sideEffects.push('register-hooks');
        return noopRegisterHooks(vaultDir);
      },
    };

    const result = await runUpdate(opts);

    // Result is failure
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeDefined();
    expect(result.error).toMatch(/validation failed/i);

    // validate was called, but register-hooks was NOT
    expect(sideEffects).toContain('validate');
    expect(sideEffects).not.toContain('register-hooks');
  });
});
