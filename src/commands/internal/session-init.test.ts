import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We test the runSessionInit function which returns the payload rather than printing it,
// so we can assert against the returned value in tests.
import {
  type ProcInfo,
  type ProcLookup,
  commBasenameOf,
  findClaudeAncestorPid,
  formatDatetime,
  resolveSessionToken,
  runSessionInit,
} from './session-init.js';

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

/**
 * ProcLookup that always returns null — simulates "no claude ancestor found".
 * Use this in tests that exercise non-walk-up branches (env vars, cache, ppid).
 */
const noClaudeAncestor: ProcLookup = () => null;

/**
 * Build a ProcLookup from a static map of pid → ProcInfo. Returns null for
 * any PID not in the map, matching how the real lookup behaves when `ps -p`
 * cannot find the process.
 */
function makeProcLookup(tree: Record<number, ProcInfo>): ProcLookup {
  return (pid: number) => tree[pid] ?? null;
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
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    expect(token).toBe('12345');
  });

  it('ignores PPID when = 1', async () => {
    clearTokenEnvVars();
    setPpid(1);
    // Should fall through to cache
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    // Token should be a 5-digit number or numeric string from cache
    expect(token).toMatch(/^\d+$/);
  });

  it('prefers WT_SESSION over PPID', async () => {
    process.env['WT_SESSION'] = 'abc-123-def-456-ghi';
    setPpid(99999);
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    // WT_SESSION stripped to alphanumeric, first 8 chars: 'abc123de'
    expect(token).toBe('abc123de');
  });

  it('strips non-alphanumeric from WT_SESSION and takes first 8 chars', async () => {
    process.env['WT_SESSION'] = '{a1b2c3d4-e5f6-7890-abcd-ef1234567890}';
    setPpid(1); // force PPID fallthrough if WT_SESSION somehow fails
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    expect(token).toBe('a1b2c3d4');
    expect(token.length).toBe(8);
  });

  it('uses TMUX_PANE when set, prefers over PPID', async () => {
    clearTokenEnvVars();
    process.env['TMUX_PANE'] = '%3';
    setPpid(99999);
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    expect(token).toBe('3');
  });

  it('uses TERM_SESSION_ID when TMUX_PANE not set', async () => {
    clearTokenEnvVars();
    process.env['TERM_SESSION_ID'] = 'C2C99E7B-1780-4A88-9FEC-E1B4DA00A47C';
    setPpid(99999);
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    expect(token).toBe('C2C99E7B');
  });

  it('prefers WT_SESSION over TMUX_PANE', async () => {
    process.env['WT_SESSION'] = 'wtsession1';
    process.env['TMUX_PANE'] = '%5';
    setPpid(99999);
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    // 'wtsession1' → strip non-alphanum → 'wtsession1' → first 8 → 'wtsessio'
    expect(token).toBe('wtsessio');
  });

  it('prefers TMUX_PANE over TERM_SESSION_ID', async () => {
    process.env['WT_SESSION'] = undefined;
    process.env['TMUX_PANE'] = '%7';
    process.env['TERM_SESSION_ID'] = 'ABCD1234-EFGH-5678';
    setPpid(99999);
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    expect(token).toBe('7');
  });

  it('reads cached token from day-scoped cache file', async () => {
    clearTokenEnvVars();
    setPpid(1); // force fallthrough
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheFile = join(tmpDir, `onebrain-day-${today}.token`);
    await writeFile(cacheFile, '54321', 'utf8');
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    expect(token).toBe('54321');
  });

  it('day-scoped cache takes priority over PPID', async () => {
    clearTokenEnvVars();
    setPpid(12345);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheFile = join(tmpDir, `onebrain-day-${today}.token`);
    await writeFile(cacheFile, '54321', 'utf8');
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    expect(token).toBe('54321'); // cache wins over ppid
  });

  it('ppid result is written to day-scoped cache for deterministic re-runs', async () => {
    clearTokenEnvVars();
    setPpid(99888);
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    expect(token).toBe('99888');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheFile = join(tmpDir, `onebrain-day-${today}.token`);
    const cached = (await Bun.file(cacheFile).text()).trim();
    expect(cached).toBe('99888');
  });

  it('writes new cache file when none exists', async () => {
    clearTokenEnvVars();
    setPpid(1); // force fallthrough
    const token = await resolveSessionToken(tmpDir, noClaudeAncestor);
    // Should be a 5-digit number
    expect(token).toMatch(/^\d{5}$/);
    // Cache file should exist
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheFile = join(tmpDir, `onebrain-day-${today}.token`);
    const cached = await Bun.file(cacheFile).text();
    expect(cached.trim()).toBe(token);
  });

  // ---- walk-up integration ------------------------------------------------

  it('walk-up: returns claude ancestor PID and skips cache write', async () => {
    clearTokenEnvVars();
    setPpid(20001); // bash wrapper
    // Simulated tree: bash(20001) → claude(30002) → init(1)
    const lookup = makeProcLookup({
      20001: { ppid: 30002, commBasename: 'bash' },
      30002: { ppid: 1, commBasename: 'claude' },
    });
    const token = await resolveSessionToken(tmpDir, lookup);
    expect(token).toBe('30002');

    // Cache file must NOT be written when walk-up succeeds — that's the whole
    // point of walk-up: deterministic per-session, no shared cache collisions.
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheFile = join(tmpDir, `onebrain-day-${today}.token`);
    const exists = await Bun.file(cacheFile).exists();
    expect(exists).toBe(false);
  });

  it('walk-up: prefers claude ancestor over existing cached token', async () => {
    // Simulates the bug fix: even if a stale cache from another session sits
    // in $TMPDIR, walk-up's claude PID wins.
    clearTokenEnvVars();
    setPpid(20001);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheFile = join(tmpDir, `onebrain-day-${today}.token`);
    await writeFile(cacheFile, '99999', 'utf8'); // stale cached token
    const lookup = makeProcLookup({
      20001: { ppid: 30002, commBasename: 'bash' },
      30002: { ppid: 1, commBasename: 'claude' },
    });
    const token = await resolveSessionToken(tmpDir, lookup);
    expect(token).toBe('30002'); // walk-up wins, ignores cache
  });

  it('walk-up: env vars (WT_SESSION) still win over walk-up', async () => {
    process.env['WT_SESSION'] = 'wtwins00';
    setPpid(20001);
    const lookup = makeProcLookup({
      20001: { ppid: 30002, commBasename: 'bash' },
      30002: { ppid: 1, commBasename: 'claude' },
    });
    const token = await resolveSessionToken(tmpDir, lookup);
    expect(token).toBe('wtwins00');
  });

  it('walk-up: falls through to cache/ppid when no claude ancestor exists', async () => {
    clearTokenEnvVars();
    setPpid(20001);
    // Simulated tree contains no `claude` process anywhere.
    const lookup = makeProcLookup({
      20001: { ppid: 20002, commBasename: 'bash' },
      20002: { ppid: 1, commBasename: 'launchd' },
    });
    const token = await resolveSessionToken(tmpDir, lookup);
    // Falls through to step 6 (process.ppid), writes to cache.
    expect(token).toBe('20001');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheFile = join(tmpDir, `onebrain-day-${today}.token`);
    const cached = (await Bun.file(cacheFile).text()).trim();
    expect(cached).toBe('20001');
  });

  it('walk-up: tolerates broken lookup (returns null) and falls through', async () => {
    clearTokenEnvVars();
    setPpid(20001);
    // Lookup always fails — simulates `ps` unavailable or unexpected output.
    const brokenLookup: ProcLookup = () => null;
    const token = await resolveSessionToken(tmpDir, brokenLookup);
    expect(token).toBe('20001'); // falls through to ppid
  });
});

// ---------------------------------------------------------------------------
// findClaudeAncestorPid
// ---------------------------------------------------------------------------

describe('findClaudeAncestorPid', () => {
  it('returns the PID of the first claude ancestor walking up', () => {
    const lookup = makeProcLookup({
      100: { ppid: 200, commBasename: 'bash' },
      200: { ppid: 300, commBasename: 'claude' },
      300: { ppid: 1, commBasename: 'launchd' },
    });
    expect(findClaudeAncestorPid(100, lookup)).toBe(200);
  });

  // The basename normalization (path strip + `.exe` trim) is performed by
  // `defaultProcLookup` before it returns ProcInfo; `findClaudeAncestorPid`
  // itself does direct equality on commBasename. The lookup-side contract
  // is verified by `commBasenameOf` tests below.

  it('returns null when no claude ancestor exists in the chain', () => {
    const lookup = makeProcLookup({
      100: { ppid: 200, commBasename: 'bash' },
      200: { ppid: 300, commBasename: 'zsh' },
      300: { ppid: 1, commBasename: 'launchd' },
    });
    expect(findClaudeAncestorPid(100, lookup)).toBeNull();
  });

  it('returns null when startPid is <= 1 (init/zero)', () => {
    const neverCalled: ProcLookup = () => {
      throw new Error('lookup must not be called for startPid <= 1');
    };
    expect(findClaudeAncestorPid(1, neverCalled)).toBeNull();
    expect(findClaudeAncestorPid(0, neverCalled)).toBeNull();
  });

  it('returns null and stops walking when lookup fails mid-chain', () => {
    const lookup = makeProcLookup({
      100: { ppid: 200, commBasename: 'bash' },
      // 200 missing from tree (lookup returns null)
    });
    expect(findClaudeAncestorPid(100, lookup)).toBeNull();
  });

  it('respects maxDepth — stops walking after depth limit', () => {
    // Build a chain: 100 → 101 → ... → 119 → 120, with claude at 120
    // (the function checks `current` at each step, so claude at depth 20)
    const tree: Record<number, ProcInfo> = {};
    for (let i = 100; i < 120; i++) tree[i] = { ppid: i + 1, commBasename: 'bash' };
    tree[120] = { ppid: 1, commBasename: 'claude' };
    const lookup = makeProcLookup(tree);

    // Default maxDepth = 12 — should NOT reach claude (which is at depth 20)
    expect(findClaudeAncestorPid(100, lookup)).toBeNull();
    // Generous maxDepth — should find it
    expect(findClaudeAncestorPid(100, lookup, 25)).toBe(120);
  });

  it('does not loop forever on a cyclic process tree', () => {
    // Pathological: 100 → 200 → 100 (cycle). Should return null without hanging.
    const lookup = makeProcLookup({
      100: { ppid: 200, commBasename: 'bash' },
      200: { ppid: 100, commBasename: 'bash' },
    });
    expect(findClaudeAncestorPid(100, lookup)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// commBasenameOf — basename normalization for ps -o comm= outputs
// ---------------------------------------------------------------------------

describe('commBasenameOf', () => {
  it('strips a unix path prefix', () => {
    expect(commBasenameOf('/opt/homebrew/bin/claude')).toBe('claude');
  });

  it('strips a windows path prefix and `.exe` suffix', () => {
    expect(commBasenameOf('C:\\Users\\me\\AppData\\Local\\claude.exe')).toBe('claude');
  });

  it('strips `.exe` case-insensitively', () => {
    expect(commBasenameOf('claude.EXE')).toBe('claude');
  });

  it('returns the input unchanged when already a basename', () => {
    expect(commBasenameOf('claude')).toBe('claude');
    expect(commBasenameOf('bash')).toBe('bash');
  });

  it('trims leading/trailing whitespace', () => {
    expect(commBasenameOf('  /usr/bin/claude  ')).toBe('claude');
  });
});

// ---------------------------------------------------------------------------
// resolveSessionToken integration: walk-up depth limit
// ---------------------------------------------------------------------------

describe('resolveSessionToken — walk-up depth limit integration', () => {
  it('falls through to ppid/cache when claude exists deeper than walk-up maxDepth', async () => {
    // Build a chain longer than the default maxDepth (12) with claude at the
    // end. The walk-up returns null before reaching claude, so resolution
    // should fall through to the ppid path and persist that token to cache.
    const tmpDir = await mkdtemp(join(tmpdir(), 'onebrain-si-test-depth-'));
    try {
      const originalEnv = { ...process.env };
      const originalPpid = process.ppid;
      try {
        process.env['WT_SESSION'] = undefined;
        process.env['TMUX_PANE'] = undefined;
        process.env['TERM_SESSION_ID'] = undefined;
        setPpid(50000);

        const tree: Record<number, ProcInfo> = {};
        for (let i = 50000; i < 50050; i++) {
          tree[i] = { ppid: i + 1, commBasename: 'bash' };
        }
        tree[50050] = { ppid: 1, commBasename: 'claude' };
        const lookup = makeProcLookup(tree);

        const token = await resolveSessionToken(tmpDir, lookup);
        // Walk-up bottomed out at depth 12 without finding claude → null →
        // fall through to step 6 (ppid).
        expect(token).toBe('50000');
      } finally {
        process.env = originalEnv;
        restorePpid(originalPpid);
      }
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
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
    const result = await runSessionInit(tmpDir, tmpDir, noClaudeAncestor);
    expect(result).toEqual({ decision: 'block', reason: 'onebrain-init-required' });
  });

  it('returns block decision when vault.yml is malformed YAML', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), MALFORMED_YAML, 'utf8');
    const result = await runSessionInit(tmpDir, tmpDir, noClaudeAncestor);
    expect(result).toEqual({ decision: 'block', reason: 'onebrain-init-required' });
  });

  it('returns normal payload when vault.yml is present and valid', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    const result = await runSessionInit(tmpDir, tmpDir, noClaudeAncestor);
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
    const result = (await runSessionInit(tmpDir, tmpDir, noClaudeAncestor)) as Record<
      string,
      unknown
    >;
    expect(result['session_token']).toBe('42001');
  });

  it('qmd_unembedded is 0 when qmd is not in PATH / errors', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    const result = (await runSessionInit(tmpDir, tmpDir, noClaudeAncestor)) as Record<
      string,
      unknown
    >;
    // qmd is not expected to be installed in test env
    expect(result['qmd_unembedded']).toBe(0);
  });

  // Update snapshots: bun test --update-snapshots
  it('normal payload output shape matches snapshot', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    setPpid(55555);
    const result = (await runSessionInit(tmpDir, tmpDir, noClaudeAncestor)) as Record<
      string,
      unknown
    >;

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
    const result = await runSessionInit(tmpDir, tmpDir, noClaudeAncestor);
    expect(result).toHaveProperty('datetime');
    expect(result).toHaveProperty('session_token');
  });

  it('cleanStaleStateFile — fresh mtime → file NOT deleted (still exists after stat)', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    // Create a state file with a fresh mtime (just written = after process start)
    const stateFile = join(tmpDir, 'onebrain-77777.state');
    await writeFile(stateFile, '1:0:00', 'utf8');
    // Fresh file should NOT be deleted
    await runSessionInit(tmpDir, tmpDir, noClaudeAncestor);
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
    await runSessionInit(tmpDir, tmpDir, noClaudeAncestor);
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
      const result = await runSessionInit(tmpDir, tmpDir, noClaudeAncestor);
      expect(result).toHaveProperty('datetime');
    } finally {
      bunFileSpy.mockRestore();
    }
  });

  it('unicode: datetime field in normal payload contains · separators that survive JSON.parse', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    const result = (await runSessionInit(tmpDir, tmpDir, noClaudeAncestor)) as Record<
      string,
      unknown
    >;
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
    const result = await runSessionInit(tmpDir, tmpDir, noClaudeAncestor);
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
      const result = (await runSessionInit(tmpDir, tmpDir, noClaudeAncestor)) as Record<
        string,
        unknown
      >;
      expect(result['qmd_unembedded']).toBe(5);
    } finally {
      spawnSpy.mockRestore();
    }
  });
});
