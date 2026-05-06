// fs-mkdir-safe — `mkdir({ recursive: true })` that tolerates iCloud Drive on Windows
//
// Standard Node `fs/promises` `mkdir(path, { recursive: true })` is documented as
// idempotent: if the directory already exists, it returns silently. This contract
// breaks on Windows when the path lives inside iCloud Drive — the CSC (Client-Side
// Caching) layer occasionally reports a path as both "does not exist yet" (to the
// pre-mkdir stat) and "already exists" (when `mkdir` actually runs), throwing
// EEXIST despite the `recursive: true` flag. See issue #126.
//
// Reproducing this on macOS or Linux is essentially impossible without simulating
// the iCloud filesystem; the wrapper exists to keep production callers from
// crashing on a transient state mismatch they cannot prevent.

import type { Stats } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';

/**
 * `mkdir(path, { recursive: true })` that swallows EEXIST when the existing
 * filesystem entry is already a directory.
 *
 * - On any error other than EEXIST → rethrows.
 * - On EEXIST → calls `stat` to confirm the path is a directory; if it's a
 *   regular file, the original EEXIST is rethrown so callers don't silently
 *   trample a file with directory semantics.
 */
export async function mkdirIdempotent(path: string): Promise<void> {
  try {
    await mkdir(path, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code !== 'EEXIST') throw err;
    // EEXIST with recursive:true is the iCloud-on-Windows quirk — confirm the
    // post-condition is met (path is a directory) before swallowing.
    let info: Stats;
    try {
      info = await stat(path);
    } catch (statErr) {
      // The stat error is usually more actionable than the original EEXIST:
      // - EACCES on the parent directory points at a permissions problem
      //   the user needs to see.
      // - ENOENT means the path was removed between mkdir and stat (a race);
      //   the original EEXIST is misleading because the path now doesn't exist.
      // In both cases we want the stat error to win, falling back to the
      // original mkdir error only if stat itself reported nothing useful.
      const statCode = (statErr as NodeJS.ErrnoException | undefined)?.code;
      throw statCode ? statErr : err;
    }
    if (!info.isDirectory()) throw err;
  }
}
