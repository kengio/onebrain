import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { mkdirIdempotent } from './fs-mkdir-safe.js';

describe('mkdirIdempotent', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'ob-mkdir-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('creates a fresh directory', async () => {
    const target = join(tmpDir, 'a', 'b', 'c');
    await mkdirIdempotent(target);
    const s = await stat(target);
    expect(s.isDirectory()).toBe(true);
  });

  it('is idempotent on a directory that already exists (no error thrown)', async () => {
    const target = join(tmpDir, 'a');
    await mkdir(target, { recursive: true });
    // Standard Node mkdir({recursive:true}) doesn't throw here either, but this
    // pins the contract: regardless of platform, calling twice must succeed.
    await mkdirIdempotent(target);
    await mkdirIdempotent(target);
    const s = await stat(target);
    expect(s.isDirectory()).toBe(true);
  });

  it('rethrows EEXIST when the existing entry is a regular file', async () => {
    const target = join(tmpDir, 'collision');
    await writeFile(target, 'not a directory', 'utf8');

    let caught: NodeJS.ErrnoException | undefined;
    try {
      await mkdirIdempotent(target);
    } catch (err) {
      caught = err as NodeJS.ErrnoException;
    }
    expect(caught).toBeDefined();
    expect(caught?.code).toBe('EEXIST');
  });

  it('rethrows non-EEXIST errors unchanged (EACCES)', async () => {
    // Drop write permission on a parent so the inner mkdir hits EACCES, not
    // EEXIST. Confirms the wrapper's EEXIST-only swallow rule — everything
    // else propagates verbatim. Skipped on win32 (chmod is a no-op).
    if (process.platform === 'win32') return;

    const lockedParent = join(tmpDir, 'locked');
    await mkdir(lockedParent);
    await chmod(lockedParent, 0o500);
    try {
      let caught: NodeJS.ErrnoException | undefined;
      try {
        await mkdirIdempotent(join(lockedParent, 'child'));
      } catch (err) {
        caught = err as NodeJS.ErrnoException;
      }
      expect(caught).toBeDefined();
      expect(caught?.code).toBe('EACCES');
    } finally {
      await chmod(lockedParent, 0o700);
    }
  });
});
