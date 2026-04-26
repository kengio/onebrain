/**
 * qmd-reindex.test.ts — tests for qmd-reindex command
 */

import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildQmdSpawnArgs, qmdReindexCommand } from './qmd-reindex.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  const base = join(tmpdir(), `ob-qmd-test-${Math.random().toString(36).slice(2)}`);
  await mkdir(base, { recursive: true });
  return base;
}

const VAULT_YML_WITH_COLLECTION = `
method: onebrain
update_channel: stable
qmd_collection: test-collection-123
folders:
  inbox: 00-inbox
  logs: 07-logs
`.trim();

const VAULT_YML_WITHOUT_COLLECTION = `
method: onebrain
update_channel: stable
folders:
  inbox: 00-inbox
  logs: 07-logs
`.trim();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('qmdReindexCommand', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('does not spawn when qmd_collection is absent in vault.yml', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VAULT_YML_WITHOUT_COLLECTION, 'utf8');

    const spawnSpy = spyOn(Bun, 'spawn');

    await qmdReindexCommand(tmpDir);

    expect(spawnSpy).not.toHaveBeenCalled();

    spawnSpy.mockRestore();
  });

  it('does not spawn and resolves without throwing when vault.yml is missing', async () => {
    // No vault.yml in tmpDir
    const spawnSpy = spyOn(Bun, 'spawn');

    await expect(qmdReindexCommand(tmpDir)).resolves.toBeUndefined();
    expect(spawnSpy).not.toHaveBeenCalled();

    spawnSpy.mockRestore();
  });

  it('spawns qmd update -c <collection> with detached options and calls unref()', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VAULT_YML_WITH_COLLECTION, 'utf8');

    const mockUnref = { called: false };
    const fakeProc = {
      unref: () => {
        mockUnref.called = true;
      },
    };

    const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(
      () => fakeProc as unknown as ReturnType<typeof Bun.spawn>,
    );

    await qmdReindexCommand(tmpDir);

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const [cmd, spawnOpts] = spawnSpy.mock.calls[0] as [string[], Record<string, unknown>];
    expect(cmd).toEqual(['qmd', 'update', '-c', 'test-collection-123']); // non-Windows path
    expect(spawnOpts).toMatchObject({
      detached: true,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });
    expect(mockUnref.called).toBe(true);

    spawnSpy.mockRestore();
  });

  it('buildQmdSpawnArgs: non-Windows returns direct qmd invocation', () => {
    const args = buildQmdSpawnArgs('my-collection', 'linux');
    expect(args).toEqual(['qmd', 'update', '-c', 'my-collection']);
  });

  it('buildQmdSpawnArgs: Windows returns powershell.exe -Command with quoted collection', () => {
    const args = buildQmdSpawnArgs('my-collection', 'win32');
    expect(args[0]).toBe('powershell.exe');
    expect(args[1]).toBe('-NoProfile');
    expect(args[2]).toBe('-Command');
    expect(args[3]).toContain('my-collection');
    expect(args[3]).toMatch(/^qmd update -c '/);
  });

  it('buildQmdSpawnArgs: Windows doubles embedded single-quotes in collection', () => {
    const args = buildQmdSpawnArgs("col'lection", 'win32');
    expect(args[3]).toContain("col''lection");
  });

  it('resolves without throwing when Bun.spawn throws', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VAULT_YML_WITH_COLLECTION, 'utf8');

    const spawnSpy = spyOn(Bun, 'spawn').mockImplementation(() => {
      throw new Error('spawn failed');
    });

    await expect(qmdReindexCommand(tmpDir)).resolves.toBeUndefined();

    spawnSpy.mockRestore();
  });
});
