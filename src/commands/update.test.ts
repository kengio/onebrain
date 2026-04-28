/**
 * Unit tests for `onebrain update`
 *
 * Uses injectable dependencies (mock fetch, binary install/validate,
 * currentVersionFn) so tests run offline and fast.
 *
 * The command is now binary-only: no vault-sync step, no register-hooks step,
 * no vault.yml version write.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
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

/** Build a mock fetch that returns a fake GitHub releases/latest response. */
function makeMockFetch(tagName: string): typeof fetch {
  const fn = async (input: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/releases/latest')) {
      return new Response(JSON.stringify({ tag_name: tagName }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  };
  return fn as typeof fetch;
}

/** Noop mocks */
const noopInstallBinary = async (_version: string): Promise<void> => {};
const noopValidateBinary = async (): Promise<boolean> => true;
const noopCurrentVersion = async () => ({ version: 'v1.10.18', publishedAt: null });

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

describe('runUpdate', () => {
  it('full upgrade path — fetch → install → validate → ok', async () => {
    const calls: string[] = [];

    const opts: UpdateOptions = {
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      installBinaryFn: async (version) => {
        calls.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        calls.push('validate');
        return true;
      },
      currentVersionFn: async () => {
        calls.push('current-version');
        return { version: 'v1.10.18', publishedAt: null };
      },
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.latestVersion).toBe('v2.0.0');
    expect(result.currentVersion).toBe('v1.10.18');

    // Install and validate called; no vault-sync or register-hooks
    expect(calls).toContain('install:v2.0.0');
    expect(calls).toContain('validate');
    expect(calls).not.toContain('vault-sync');
    expect(calls).not.toContain('register-hooks');
  });

  it('--check flag — fetch only, no install/validate, exits 0', async () => {
    const calls: string[] = [];

    const opts: UpdateOptions = {
      isTTY: false,
      check: true,
      fetchFn: makeMockFetch('v2.0.0'),
      installBinaryFn: async (version) => {
        calls.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        calls.push('validate');
        return true;
      },
      currentVersionFn: noopCurrentVersion,
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.latestVersion).toBe('v2.0.0');

    // No side-effecting steps called
    expect(calls).toHaveLength(0);
  });

  it('already up to date — currentVersion === latestVersion → skip install, outro "nothing to do"', async () => {
    const calls: string[] = [];

    const opts: UpdateOptions = {
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      installBinaryFn: async (version) => {
        calls.push(`install:${version}`);
      },
      validateBinaryFn: async () => {
        calls.push('validate');
        return true;
      },
      currentVersionFn: async () => ({ version: 'v2.0.0', publishedAt: null }), // same as latest
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.latestVersion).toBe('v2.0.0');
    expect(result.currentVersion).toBe('v2.0.0');

    // Install NOT called
    expect(calls).not.toContain('install:v2.0.0');
  });

  it('GitHub fetch failure → exits 1 with error', async () => {
    const failFetch = (async () =>
      new Response('Service Unavailable', { status: 503 })) as unknown as typeof fetch;

    const opts: UpdateOptions = {
      isTTY: false,
      fetchFn: failFetch,
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      currentVersionFn: noopCurrentVersion,
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeDefined();
  });

  it('binary install failure → exits 1', async () => {
    const opts: UpdateOptions = {
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      installBinaryFn: async () => {
        throw new Error('npm: EACCES permission denied');
      },
      validateBinaryFn: noopValidateBinary,
      currentVersionFn: noopCurrentVersion,
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toBeDefined();
  });

  it('binary validation failure → exits 1', async () => {
    const opts: UpdateOptions = {
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: async () => false,
      currentVersionFn: noopCurrentVersion,
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/Binary validation failed/);
  });

  it('runs from any directory — no vault.yml required', async () => {
    const opts: UpdateOptions = {
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      currentVersionFn: async () => ({ version: 'v1.10.18', publishedAt: null }),
    };

    const result = await runUpdate(opts);

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.latestVersion).toBe('v2.0.0');
  });

  it('currentVersionFn returns "unknown" → install proceeds, currentVersion = "unknown"', async () => {
    const opts: UpdateOptions = {
      isTTY: false,
      fetchFn: makeMockFetch('v2.0.0'),
      installBinaryFn: noopInstallBinary,
      validateBinaryFn: noopValidateBinary,
      currentVersionFn: async () => ({ version: 'unknown', publishedAt: null }),
    };

    const result = await runUpdate(opts);

    // 'unknown' !== 'v2.0.0', so install proceeds
    expect(result.ok).toBe(true);
    expect(result.currentVersion).toBe('unknown');
    expect(result.latestVersion).toBe('v2.0.0');
  });

  it('non-TTY output format — includes key status lines', async () => {
    const lines: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    // biome-ignore lint/suspicious/noExplicitAny: overriding overloaded write for test capture
    (process.stdout as any).write = (
      chunk: string | Uint8Array,
      encoding?: BufferEncoding,
      cb?: (err?: Error | null) => void,
    ): boolean => {
      if (typeof chunk === 'string') lines.push(chunk);
      else if (chunk instanceof Uint8Array) lines.push(Buffer.from(chunk).toString('utf8'));
      return originalWrite(chunk, encoding as BufferEncoding, cb);
    };

    try {
      const opts: UpdateOptions = {
        isTTY: false,
        fetchFn: makeMockFetch('v2.0.0'),
        installBinaryFn: noopInstallBinary,
        validateBinaryFn: noopValidateBinary,
        currentVersionFn: noopCurrentVersion,
      };
      await runUpdate(opts);
    } finally {
      process.stdout.write = originalWrite;
    }

    const fullOutput = lines.join('');
    expect(fullOutput).toMatch(/OneBrain Update/);
    expect(fullOutput).toMatch(/done:/i);
  });
});

describe('defaultValidateBinary regex', () => {
  const regex = /v\d+\.\d+/;

  it('matches actual onebrain --version output format', () => {
    expect(regex.test('OneBrain v2.0.7 — released 2026-04-26')).toBe(true);
  });

  it('old regex /^\\d+\\.\\d+/ would not match the same output', () => {
    const oldRegex = /^\d+\.\d+/;
    expect(oldRegex.test('OneBrain v2.0.7 — released 2026-04-26')).toBe(false);
  });
});
