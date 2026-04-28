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
 * Detect which AI runtime harness is in use.
 *
 * Priority:
 *   1. ONEBRAIN_HARNESS env var (explicit override)
 *   2. .gemini/ directory present → gemini
 *   3. .claude/ directory present → claude
 *   4. fallback → direct
 */
export async function detectHarness(vaultRoot: string): Promise<Harness> {
  const env = process.env['ONEBRAIN_HARNESS'];
  if (env) {
    if (env === 'claude' || env === 'claude-code') return 'claude';
    if (env === 'gemini') return 'gemini';
    if (env === 'direct') return 'direct';
    process.stderr.write(
      `harness: unknown ONEBRAIN_HARNESS value "${env}" — ignoring, falling back to directory detection\n`,
    );
  }

  if (await pathExists(join(vaultRoot, '.gemini'))) return 'gemini';
  if (await pathExists(join(vaultRoot, '.claude'))) return 'claude';

  return 'direct';
}
