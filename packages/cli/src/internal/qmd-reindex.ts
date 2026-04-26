/**
 * qmd-reindex — internal command
 *
 * Spawns a detached background process to run `qmd update -c <collection>`.
 * The process runs asynchronously without blocking the CLI.
 *
 * Exit behavior:
 * - Always exits 0 (fire-and-forget)
 * - Errors written to stderr, exit code always 0
 * - No stdout output
 */

import { loadVaultConfig } from '@onebrain/core';

/**
 * Build the spawn args for `qmd update -c <collection>`.
 * On Windows, Bun.spawn cannot invoke .cmd/.ps1 scripts via CreateProcess —
 * route through PowerShell. Collection is single-quoted (PowerShell literal
 * string); embedded single quotes are escaped by doubling ('').
 * Exported for testing.
 */
export function buildQmdSpawnArgs(
  collection: string,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === 'win32') {
    const safe = collection.replace(/'/g, "''");
    return ['powershell.exe', '-NoProfile', '-Command', `qmd update -c '${safe}'`];
  }
  return ['qmd', 'update', '-c', collection];
}

/**
 * Run qmd-reindex as a CLI command.
 * Spawns detached background process, always exits 0.
 */
export async function qmdReindexCommand(vaultRoot: string): Promise<void> {
  try {
    const config = await loadVaultConfig(vaultRoot);
    const collection = config.qmd_collection;

    if (!collection) {
      return;
    }

    const proc = Bun.spawn(buildQmdSpawnArgs(collection), {
      detached: true,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    proc.unref();
  } catch (err) {
    process.stderr.write(`qmd-reindex: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
