import { rename, unlink, writeFile } from 'node:fs/promises';

/**
 * Atomic write: stage to `<dest>.tmp`, then rename. If rename fails (cross-
 * device, permission, ENOSPC, dest-is-directory), remove the staged tmp file
 * before rethrowing with context — otherwise the tmp lingers on disk forever.
 *
 * The thrown Error preserves the original via the `cause` property so callers
 * can still inspect the underlying errno.
 */
export async function atomicWrite(dest: string, contents: string, label?: string): Promise<void> {
  const tmpPath = `${dest}.tmp`;
  await writeFile(tmpPath, contents, 'utf8');
  try {
    await rename(tmpPath, dest);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`rename failed for ${label ?? dest}; tmp cleaned up: ${msg}`, { cause: err });
  }
}
