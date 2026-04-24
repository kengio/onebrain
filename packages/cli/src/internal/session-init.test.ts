import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We test the runSessionInit function which returns the payload rather than printing it,
// so we can assert against the returned value in tests.
import { runSessionInit, formatDatetime, resolveSessionToken } from './session-init.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'onebrain-si-test-'));
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
});

// ---------------------------------------------------------------------------
// resolveSessionToken
// ---------------------------------------------------------------------------

describe('resolveSessionToken', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tmpDir: string;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tmpDir = await makeTmpDir();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('uses PPID when > 1', async () => {
    delete process.env['WT_SESSION'];
    process.env['PPID'] = '12345';
    const token = await resolveSessionToken(tmpDir);
    expect(token).toBe('12345');
  });

  it('ignores PPID when = 1', async () => {
    delete process.env['WT_SESSION'];
    process.env['PPID'] = '1';
    // Should fall through to cache
    const token = await resolveSessionToken(tmpDir);
    // Token should be a 5-digit number or numeric string from cache
    expect(token).toMatch(/^\d+$/);
  });

  it('prefers WT_SESSION over PPID', async () => {
    process.env['WT_SESSION'] = 'abc-123-def-456-ghi';
    process.env['PPID'] = '99999';
    const token = await resolveSessionToken(tmpDir);
    // WT_SESSION stripped to alphanumeric, first 8 chars: 'abc123de'
    expect(token).toBe('abc123de');
  });

  it('strips non-alphanumeric from WT_SESSION and takes first 8 chars', async () => {
    process.env['WT_SESSION'] = '{a1b2c3d4-e5f6-7890-abcd-ef1234567890}';
    delete process.env['PPID'];
    const token = await resolveSessionToken(tmpDir);
    expect(token).toBe('a1b2c3d4');
    expect(token.length).toBe(8);
  });

  it('reads cached token from day-scoped cache file', async () => {
    delete process.env['WT_SESSION'];
    process.env['PPID'] = '1'; // force fallthrough
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheFile = join(tmpDir, `onebrain-day-${today}.token`);
    await writeFile(cacheFile, '54321', 'utf8');
    const token = await resolveSessionToken(tmpDir);
    expect(token).toBe('54321');
  });

  it('writes new cache file when none exists', async () => {
    delete process.env['WT_SESSION'];
    process.env['PPID'] = '1'; // force fallthrough
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

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tmpDir = await makeTmpDir();
    // Ensure PPID is set for predictable token resolution in most tests
    delete process.env['WT_SESSION'];
    process.env['PPID'] = '77777';
  });

  afterEach(async () => {
    process.env = originalEnv;
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
    process.env['PPID'] = '42001';
    const result = await runSessionInit(tmpDir, tmpDir) as Record<string, unknown>;
    expect(result['session_token']).toBe('42001');
  });

  it('qmd_unembedded is 0 when qmd is not in PATH / errors', async () => {
    await writeFile(join(tmpDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
    const result = await runSessionInit(tmpDir, tmpDir) as Record<string, unknown>;
    // qmd is not expected to be installed in test env
    expect(result['qmd_unembedded']).toBe(0);
  });
});
