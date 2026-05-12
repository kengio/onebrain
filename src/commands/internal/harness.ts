import { stat } from 'node:fs/promises';
import { join } from 'node:path';

export type Harness = 'claude' | 'gemini' | 'direct';

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect which AI runtime harness(es) are in use.
 *
 * A vault may configure multiple harnesses (e.g. both .claude/ and .gemini/
 * present means the user wants OneBrain hooks installed for BOTH). Return all
 * detected; caller decides what to do with each.
 *
 * Priority:
 *   1. ONEBRAIN_HARNESS env var (explicit override — single value, returned as
 *      a one-element array; honors backward compat with the single-harness API).
 *   2. .claude/ and .gemini/ directory presence — independent checks; either or
 *      both can be returned.
 *   3. fallback → ['direct']
 */
export async function detectHarnesses(vaultRoot: string): Promise<Harness[]> {
  const env = process.env['ONEBRAIN_HARNESS'];
  if (env) {
    if (env === 'claude' || env === 'claude-code') return ['claude'];
    if (env === 'gemini') return ['gemini'];
    if (env === 'direct') return ['direct'];
    process.stderr.write(
      `harness: unknown ONEBRAIN_HARNESS value "${env}" — ignoring, falling back to directory detection\n`,
    );
  }

  const detected: Harness[] = [];
  if (await pathExists(join(vaultRoot, '.claude'))) detected.push('claude');
  if (await pathExists(join(vaultRoot, '.gemini'))) detected.push('gemini');

  if (detected.length === 0) return ['direct'];
  return detected;
}

/**
 * Backward-compat shim: keep the old `detectHarness` signature for any callers
 * outside register-hooks that consume a single value. Returns the FIRST
 * detected harness, mirroring the new priority (claude before gemini).
 *
 * `detectHarnesses` always returns at least one element (`['direct']` as
 * fallback), so the destructured value is non-undefined — the explicit
 * `?? 'direct'` is a defense-in-depth guard that lets us avoid a non-null
 * assertion without changing observable behavior.
 */
export async function detectHarness(vaultRoot: string): Promise<Harness> {
  const [first] = await detectHarnesses(vaultRoot);
  return first ?? 'direct';
}
