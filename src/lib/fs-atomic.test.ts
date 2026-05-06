import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { atomicWrite } from './fs-atomic.js';

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'fs-atomic-test-'));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('atomicWrite', () => {
  it('writes file successfully and removes the .tmp staging file on the happy path', async () => {
    const dest = join(workDir, 'foo.txt');
    await atomicWrite(dest, 'bar');

    expect(await readFile(dest, 'utf8')).toBe('bar');

    // .tmp must not linger
    let tmpExists = false;
    try {
      await stat(`${dest}.tmp`);
      tmpExists = true;
    } catch {
      tmpExists = false;
    }
    expect(tmpExists).toBe(false);
  });

  it('overwrites an existing file atomically', async () => {
    const dest = join(workDir, 'overwrite.txt');
    await writeFile(dest, 'old', 'utf8');
    await atomicWrite(dest, 'new');
    expect(await readFile(dest, 'utf8')).toBe('new');
  });

  it('cleans up .tmp and rethrows with `cause` when rename fails', async () => {
    // Force rename failure: pre-create dest as a non-empty directory.
    // POSIX `rename(file, dir)` fails with EISDIR / ENOTEMPTY (Linux/macOS),
    // Windows fails with EPERM. Either way the catch branch runs.
    const dest = join(workDir, 'collide');
    await mkdir(dest, { recursive: true });
    await writeFile(join(dest, 'occupant.txt'), 'cannot-be-removed', 'utf8');

    let thrown: unknown;
    try {
      await atomicWrite(dest, 'payload', 'collide-target');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain('rename failed for collide-target');
    expect((thrown as Error).message).toContain('tmp cleaned up');
    // `cause` must be the original errno error
    expect((thrown as Error).cause).toBeDefined();

    // .tmp file is gone
    let tmpExists = false;
    try {
      await stat(`${dest}.tmp`);
      tmpExists = true;
    } catch {
      tmpExists = false;
    }
    expect(tmpExists).toBe(false);
  });
});
