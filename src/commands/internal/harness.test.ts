/**
 * Tests for harness detection.
 *
 * `detectHarnesses()` returns ALL detected harnesses (multi-harness vaults
 * matter — a vault with both .claude/ and .gemini/ wants OneBrain configured
 * for both). `detectHarness()` is a thin wrapper that returns the first.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectHarness, detectHarnesses } from './harness.js';

let vaultDir: string;

beforeEach(async () => {
  vaultDir = join(tmpdir(), `ob-harness-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(vaultDir, { recursive: true });
  // biome-ignore lint/performance/noDelete: env cleanup requires delete to unset
  delete process.env['ONEBRAIN_HARNESS'];
});

afterEach(async () => {
  await rm(vaultDir, { recursive: true, force: true });
  // biome-ignore lint/performance/noDelete: env cleanup requires delete to unset
  delete process.env['ONEBRAIN_HARNESS'];
});

// ---------------------------------------------------------------------------
// detectHarnesses
// ---------------------------------------------------------------------------

describe('detectHarnesses', () => {
  test('both .claude/ and .gemini/ present → ["claude", "gemini"] (claude first)', async () => {
    await mkdir(join(vaultDir, '.claude'), { recursive: true });
    await mkdir(join(vaultDir, '.gemini'), { recursive: true });

    const result = await detectHarnesses(vaultDir);
    expect(result).toEqual(['claude', 'gemini']);
  });

  test('only .claude/ present → ["claude"]', async () => {
    await mkdir(join(vaultDir, '.claude'), { recursive: true });

    const result = await detectHarnesses(vaultDir);
    expect(result).toEqual(['claude']);
  });

  test('only .gemini/ present → ["gemini"]', async () => {
    await mkdir(join(vaultDir, '.gemini'), { recursive: true });

    const result = await detectHarnesses(vaultDir);
    expect(result).toEqual(['gemini']);
  });

  test('neither directory present → ["direct"]', async () => {
    const result = await detectHarnesses(vaultDir);
    expect(result).toEqual(['direct']);
  });

  test('ONEBRAIN_HARNESS=claude → ["claude"] (overrides directory detection)', async () => {
    process.env['ONEBRAIN_HARNESS'] = 'claude';
    // .gemini/ present should be ignored when env is set
    await mkdir(join(vaultDir, '.gemini'), { recursive: true });

    const result = await detectHarnesses(vaultDir);
    expect(result).toEqual(['claude']);
  });

  test('ONEBRAIN_HARNESS=claude-code → ["claude"] (alias)', async () => {
    process.env['ONEBRAIN_HARNESS'] = 'claude-code';
    const result = await detectHarnesses(vaultDir);
    expect(result).toEqual(['claude']);
  });

  test('ONEBRAIN_HARNESS=gemini → ["gemini"]', async () => {
    process.env['ONEBRAIN_HARNESS'] = 'gemini';
    // .claude/ present should be ignored when env is set
    await mkdir(join(vaultDir, '.claude'), { recursive: true });

    const result = await detectHarnesses(vaultDir);
    expect(result).toEqual(['gemini']);
  });

  test('ONEBRAIN_HARNESS=direct → ["direct"]', async () => {
    process.env['ONEBRAIN_HARNESS'] = 'direct';
    const result = await detectHarnesses(vaultDir);
    expect(result).toEqual(['direct']);
  });

  test('ONEBRAIN_HARNESS=garbage → falls back to directory detection', async () => {
    process.env['ONEBRAIN_HARNESS'] = 'not-a-harness';
    await mkdir(join(vaultDir, '.claude'), { recursive: true });

    const result = await detectHarnesses(vaultDir);
    expect(result).toEqual(['claude']);
  });
});

// ---------------------------------------------------------------------------
// detectHarness — backward-compat wrapper
// ---------------------------------------------------------------------------

describe('detectHarness (legacy single-value wrapper)', () => {
  test('both .claude/ and .gemini/ → "claude" (first detected)', async () => {
    await mkdir(join(vaultDir, '.claude'), { recursive: true });
    await mkdir(join(vaultDir, '.gemini'), { recursive: true });

    const result = await detectHarness(vaultDir);
    expect(result).toBe('claude');
  });

  test('only .claude/ → "claude"', async () => {
    await mkdir(join(vaultDir, '.claude'), { recursive: true });
    const result = await detectHarness(vaultDir);
    expect(result).toBe('claude');
  });

  test('only .gemini/ → "gemini"', async () => {
    await mkdir(join(vaultDir, '.gemini'), { recursive: true });
    const result = await detectHarness(vaultDir);
    expect(result).toBe('gemini');
  });

  test('neither → "direct"', async () => {
    const result = await detectHarness(vaultDir);
    expect(result).toBe('direct');
  });

  test('ONEBRAIN_HARNESS=gemini → "gemini"', async () => {
    process.env['ONEBRAIN_HARNESS'] = 'gemini';
    const result = await detectHarness(vaultDir);
    expect(result).toBe('gemini');
  });
});
