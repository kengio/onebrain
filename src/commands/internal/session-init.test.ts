import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We test the runSessionInit function which returns the payload rather than printing it,
// so we can assert against the returned value in tests.
import { formatDatetime, resolveSessionToken, runSessionInit } from './session-init.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'onebrain-si-test-'));
}

/** Set process.ppid (read-only property) for testing. Returns the original value. */
function setPpid(value: number): number {
  const original = process.ppid;
  Object.defineProperty(process, 'ppid', { value, configurable: true });
  return original;
}

/** Restore process.ppid to its original value. */
function restorePpid(original: number): void {
  Object.defineProperty(process, 'ppid', { value: original, configurable: true });
}

const VALID_VAULT_YML = `
method: onebrain
update_channel: stable
folders:
  inbox: 00-inbox
  logs: 07-logs
`.trim();

const MALFORMED_YAML = `
folders: [
  - broken: yaml
`.trim();

// ---------------------------------------------------------------------------
// formatDatetime
// ---------------------------------------------------------------------------

describe('formatDatetime', () => {
  it('formats a date as "Ddd · DD Mon YYYY · HH:MM"', () => {
    // 2026-04-23 18:04 Thursday
    const d = new Date('2026-04-23T18:04:00');
    const result = formatDatetime(d);
    // Should match pattern like "Thu · 23 Apr 2026 · 18:04"
    expect(result).toMatch(/^[A-Z][a-z]{2} · \d{2} [A-Z][a-z]{2} \d{4} · \d{2}:\d{2}$/);
  });

  it('zero-pads day and hour', () => {
    // 2026-01-03 09:05 Saturday
    const d = new Date('2026-01-03T09:05:00');
    const result = formatDatetime(d);
    expect(result).toContain('· 03 Jan 2026 ·');
    expect(result).toContain('· 09:05');
  });

  it('unicode: datetime contains exactly two · separators (U+00B7 MIDDLE DOT)', () => {
    const d = new Date('2026-04-23T18:04:00');
    const result = formatDatetime(d);
    const dots = [...result].filter((ch) => ch === '·');
    expect(dots.length).toBe(2);
  });

  it('unicode: · separators survive JSON round-trip (stringify → parse)', () => {
    const d = new Date('2026-07-15T09:30:00');
    const datetime = formatDatetime(d);
    const json = JSON.stringify({ datetime });
    const parsed = JSON.parse(json) as { datetime: string };
    expect(parsed.datetime).toBe(datetime);
    expect(parsed.datetime).toContain('·');
  });

  it('unicode: datetime is valid UTF-8 — all chars have char codes within valid BMP range', () => {
    const d = new Date('2026-12-31T23:59:00');
    const result = formatDatetime(d);
    // Every character must encode cleanly into UTF-8 without replacement chars
    const encoded = new TextEncoder().encode(result);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(encoded);
    expect(decoded).toBe(result);
  });
});

// ---------------------------------------------------------------------------
// resolveSessionToken
// ---------------------------------------------------------------------------

describe('resolveSessionToken', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalPpid: number;
  let tmpDir: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    originalPpid = process.ppid;
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    process.env = originalEnv;
    restorePpid(originalPpid);
    await rm(tmpDir, { recursive: true, force: true });
  });

  /** Clear all env-var token sources so tests that check PPID/cache behaviour are isolated. */
  function clearTokenEnvVars(): void {
    process.env['WT_SESSION'] = undefined;
    process.env['TMUX_PANE'] = undefined;
    process.env['TERM_SESSION_ID'] = undefined;
  }

  it('uses PPID when > 1', async () => {
    clearTokenEnvVars();
    setPpid(12345);
    const token = await resolveSessionToken(tmpDir);
    expect(token).toBe('12345');
  });

  it('ignores PPID when = 1', async () => {
    clearTokenEnvVars();
    setPpid(1);
    // Should fall through to cache
    const token = await resolveSessionToken(tmpDir);
    // Token should be a 5-digit number or numeric string from cache
    expect(token).toMatch(/^\d+$/);
  });

  it('prefers WT_SESSION over PPID', async () => {
    process.env['WT_SESSION'] = 'abc-123-def-456-ghi';
    setPpid(99999);
    const token = await resolveSessionToken(tmpDir);
    // WT_SESSION stripped to alphanumeric, first 8 chars: 'abc123de'
    expect(token).toBe('abc123de');
  });

  it('strips non-alphanumeric from WT_SESSION and takes first 8 chars', async () => {
    process.env['WT_SESSION'] = '{a1b2c3d4-e5f6-7890-abcd-ef1234567890}';
    setPpid(1); // force PPID fallthrough if WT_SESSION somehow fails
    const token = await resolveSessionToken(tmpDir);
    expect(token).toBe('a1b2c3d4');
    expect(token.length).toBe(8);
  });

  it('uses TMUX_PANE when set, prefers over PPID', async () => {
    clearTokenEnvVars();
    process.env['TMUX_PANE'] = '%3';
    setPpid(99999);
    const token = await resolveSessionToken(tmpDir);
    expect(token).toBe('3');
  });

  it('uses TERM_SESSION_ID when TMUX_PANE not set', async () => {
    clearTokenEnvVars();
    process.env['TERM_SESSION_ID'] = 'C2C99E7B-1780-4A88-9FEC-E1B4DA00A47C';
    setPpid(99999);
    const token = await resolveSessionToken(tmpDir);
    expect(token).toBe('C2C99E7B');
  });

  it('prefers WT_SESSION over TMUX_PANE', async () => {
    process.env['WT_SESSION'] = 'wtsession1';
    process.env['TMUX_PANE'] = '%5';
    setPpid(99999);
    const token = await resolveSessionToken(tmpDir);
    // 'wtsession1' → strip non-alphanum → 'wtsession1' → first 8 → 'wtsessio'
    expect(token).toBe('wtsessio');
  });

  it('prefers TMUX_PANE over TERM_SESSION_ID', async () => {
    process.env['WT_SESSION'] = undefined;
    process.env['TMUX_PANE'] = '%7';
    process.env['TERM_SESSION_ID'] = 'ABCD1234-EFGH-5678';
    setPpid(99999);
    const token = await resolveSessionToken(tmpDir);
    expect(token).toBe('7');
  });

  it('reads cached token from day-scoped cache file', async () => {
    clearTokenEnvVars();
    setPpid(1); // force fallthrough
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheFile = join(tmpDir, `onebrain-day-${today}.token`);
    await writeFile(cacheFile, '54321', 'utf8');
    const token = await resolveSessionToken(tmpDir);
    expect(token).toBe('54321');
  });

  it('writes new cache file when none exists', async () => {
    clearTokenEnvVars();
    setPpid(1); // force fallthrough
    const token = await resolveSessionToken(tmpDir);
    // Should be a 5-digit number
    expect(token).toMatch(/^\d{5}$/);
    // Cache file should exist
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheFile = join(tmpDir, `onebrain-day-${today}.token`);
    const cached = await Bun.file(cacheFile).text();
    expect(cached.trim()).toBe(token);
  });
});

// ---------------------------------------------------------------------------
// runSessionInit
// ---------------------------------------------------------------------------

describe('runSessionInit', () => {
  let tmpDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalPpid: number;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    originalPpid = process.ppid;
    tmpDir = await makeTmpDir();
    // Clear all env-var token sources for predictable token resolution
    process.env['WT_SESSION'] = undefined;
    process.env['TMUX_PANE'] = undefined;
    process.env['TERM_SESSION_ID'] = undefined;
    setPpid(77777);
  });

  afterEach(async () => {
    process.env = originalEnv;
    restorePpid(originalPpid);
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns block decision when vault.yml is missing', async () => {
    const result = await runSessionInit(tmpDir, tmpDir);
    expect(result).toEqual({ decision: 'block', reason: 'onebrain-init-required' });
  });

  it('returns block decision when vault.yml is malformed YAML', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), MALFORMED_YAML, 'utf8');
    const result = await runSessionInit(tmpDir, tmpDir);
    expect(result).toEqual({ decision: 'block', reason: 'onebrain-init-required' });
  });

  it('returns normal payload when vault.yml is present and valid', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    const result = await runSessionInit(tmpDir, tmpDir);
    expect(result).toHaveProperty('datetime');
    expect(result).toHaveProperty('session_token');
    expect(result).toHaveProperty('qmd_unembedded', 0);
    // Datetime format check
    expect((result as Record<string, unknown>)['datetime']).toMatch(
      /^[A-Z][a-z]{2} · \d{2} [A-Z][a-z]{2} \d{4} · \d{2}:\d{2}$/,
    );
  });

  it('uses PPID as session_token', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    setPpid(42001);
    const result = (await runSessionInit(tmpDir, tmpDir)) as Record<string, unknown>;
    expect(result['session_token']).toBe('42001');
  });

  it('qmd_unembedded is 0 when qmd is not in PATH / errors', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    const result = (await runSessionInit(tmpDir, tmpDir)) as Record<string, unknown>;
    // qmd is not expected to be installed in test env
    expect(result['qmd_unembedded']).toBe(0);
  });

  // Update snapshots: bun test --update-snapshots
  it('normal payload output shape matches snapshot', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    setPpid(55555);
    const result = (await runSessionInit(tmpDir, tmpDir)) as Record<string, unknown>;

    // Lock the exact field names of the SessionInitPayload shape.
    // The values are dynamic (datetime, session_token vary), so we assert structure only.
    expect(Object.keys(result).sort()).toMatchSnapshot();
    expect(typeof result['datetime']).toMatchSnapshot();
    expect(typeof result['session_token']).toMatchSnapshot();
    expect(typeof result['qmd_unembedded']).toMatchSnapshot();
  });

  it('cleanStaleStateFile — no state file → resolves normally with payload', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    // No state file exists in tmpDir
    const result = await runSessionInit(tmpDir, tmpDir);
    expect(result).toHaveProperty('datetime');
    expect(result).toHaveProperty('session_token');
  });

  it('cleanStaleStateFile — fresh mtime → file NOT deleted (still exists after stat)', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    // Create a state file with a fresh mtime (just written = after process start)
    const stateFile = join(tmpDir, 'onebrain-77777.state');
    await writeFile(stateFile, '1:0:00', 'utf8');
    // Fresh file should NOT be deleted
    await runSessionInit(tmpDir, tmpDir);
    // File should still exist (mtime is fresh, after process start)
    const s = await stat(stateFile);
    expect(s).toBeDefined();
  });

  it('cleanStaleStateFile — stale mtime (utimes sets to epoch 0) → file deleted', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    const stateFile = join(tmpDir, 'onebrain-77777.state');
    await writeFile(stateFile, '1:0:00', 'utf8');
    // Set mtime to epoch (far in the past) — definitely before process start
    await utimes(stateFile, 0, 0);
    // Run session init — stale file should be cleaned up
    await runSessionInit(tmpDir, tmpDir);
    // File should be gone
    await expect(stat(stateFile)).rejects.toThrow();
  });

  it('cleanStaleStateFile — EACCES from Bun.file().stat() → caught silently, result still has datetime', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    // Spy on Bun.file to simulate stat() throwing EACCES
    const originalBunFile = Bun.file.bind(Bun);
    const bunFileSpy = spyOn(Bun, 'file').mockImplementation((path: unknown) => {
      const f = originalBunFile(path as string);
      if (typeof path === 'string' && path.endsWith('.state')) {
        return {
          ...f,
          exists: async () => true,
          stat: async () => {
            const err = new Error('Permission denied') as NodeJS.ErrnoException;
            err.code = 'EACCES';
            throw err;
          },
          text: f.text.bind(f),
        } as unknown as ReturnType<typeof Bun.file>;
      }
      return f;
    });

    try {
      const result = await runSessionInit(tmpDir, tmpDir);
      expect(result).toHaveProperty('datetime');
    } finally {
      bunFileSpy.mockRestore();
    }
  });

  it('unicode: datetime field in normal payload contains · separators that survive JSON.parse', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    const result = (await runSessionInit(tmpDir, tmpDir)) as Record<string, unknown>;
    const datetime = result['datetime'] as string;

    // The field must contain the middle-dot separator used in the greeting format
    expect(datetime).toContain('·');

    // Round-trip: serialise the entire payload to JSON and parse it back
    const json = JSON.stringify(result);
    const reparsed = JSON.parse(json) as Record<string, unknown>;
    expect(reparsed['datetime']).toBe(datetime);
  });

  it('unicode: full JSON payload is valid UTF-8 — encode → decode is lossless', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    const result = await runSessionInit(tmpDir, tmpDir);
    const json = JSON.stringify(result);

    const encoded = new TextEncoder().encode(json);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(encoded);
    expect(decoded).toBe(json);
  });

  it('qmd_unembedded reflects unembedded count from qmd status --json', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');

    const qmdJson = JSON.stringify({ unembedded: 5 });
    const encoded = new TextEncoder().encode(qmdJson);

    // Build a minimal fake subprocess: exited resolves to 0, stdout is readable
    const fakeStdout = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });

    const fakeProc = {
      exited: Promise.resolve(0),
      stdout: fakeStdout,
      stderr: new ReadableStream({
        start(c) {
          c.close();
        },
      }),
      kill: () => {},
    };

    const spawnSpy = spyOn(Bun, 'spawn').mockImplementation((cmd: unknown) => {
      if (Array.isArray(cmd) && cmd[0] === 'qmd') {
        return fakeProc as unknown as ReturnType<typeof Bun.spawn>;
      }
      // PowerShell or other spawns — throw so they fall through gracefully
      throw new Error('not on Windows');
    });

    try {
      const result = (await runSessionInit(tmpDir, tmpDir)) as Record<string, unknown>;
      expect(result['qmd_unembedded']).toBe(5);
    } finally {
      spawnSpy.mockRestore();
    }
  });
});
