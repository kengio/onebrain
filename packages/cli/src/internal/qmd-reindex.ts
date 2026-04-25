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
 * Run qmd-reindex as a CLI command.
 * Spawns detached background process, always exits 0.
 */
export async function qmdReindexCommand(vaultRoot: string): Promise<void> {
  try {
    // Load vault config
    const config = await loadVaultConfig(vaultRoot);
    const collection = config.qmd_collection;

    // If qmd_collection not set, exit silently (no-op)
    if (!collection) {
      return;
    }

    // Spawn detached background process
    const proc = Bun.spawn(['qmd', 'update', '-c', collection], {
      detached: true,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    proc.unref(); // release parent reference — CLI exits immediately

    // Fire-and-forget: do NOT call proc.exited or await anything
    // Process runs in the background
  } catch (err) {
    process.stderr.write(`qmd-reindex: ${err instanceof Error ? err.message : String(err)}\n`);
  }
}
