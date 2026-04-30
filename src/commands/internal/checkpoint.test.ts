/**
 * checkpoint.test.ts — tests for checkpoint command (stop/reset)
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handleReset,
  handleStop,
  maxCheckpointNnSync,
  readState,
  writeState,
} from './checkpoint.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTmpDir(): Promise<string> {
  const base = join(tmpdir(), `ob-cp-test-${Math.random().toString(36).slice(2)}`);
  await mkdir(base, { recursive: true });
  return base;
}

const TOKEN = '41928';
const VALID_VAULT_YML = `
method: onebrain
update_channel: stable
folders:
  inbox: 00-inbox
  logs: 07-logs
checkpoint:
  messages: 5
  minutes: 10
`.trim();

function stateFile(tmpDir: string, token: string): string {
  return join(tmpDir, `onebrain-${token}.state`);
}

async function createCheckpointFile(
  vaultDir: string,
  now: number,
  token: string,
  nn: number,
): Promise<void> {
  const d = new Date(now * 1000);
  const yyyy = d.getFullYear().toString();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const date = `${yyyy}-${mm}-${dd}`;
  const dir = join(vaultDir, '07-logs', yyyy, mm);
  await mkdir(dir, { recursive: true });
  const nnStr = String(nn).padStart(2, '0');
  await writeFile(
    join(dir, `${date}-${token}-checkpoint-${nnStr}.md`),
    `---\ndate: ${date}\ncheckpoint: ${nnStr}\nmerged: false\n---\n`,
    'utf8',
  );
}

// Capture stdout written via process.stdout.write
function captureStdout(): { stop: () => string } {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  };
  return {
    stop: () => {
      process.stdout.write = original;
      return chunks.join('');
    },
  };
}

// ---------------------------------------------------------------------------
// readState / writeState
// ---------------------------------------------------------------------------

describe('readState / writeState', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns default state when no file exists', () => {
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(0);
    expect(state.last_stop_nn).toBe('00');
  });

  it('reads 3-field state correctly', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '3:1000000:02', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(3);
    expect(state.last_ts).toBe(1000000);
    expect(state.last_stop_nn).toBe('02');
  });

  it('reads 4-field legacy state — slot 4 silently ignored (post-v2.1.6 pending flag)', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '0:1000000:02:1', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(1000000);
    expect(state.last_stop_nn).toBe('02');
  });

  it('reads 4-field legacy pending_stub format → slot 4 ignored', async () => {
    await writeFile(
      stateFile(tmpDir, TOKEN),
      '0:1000000:03:2026-04-23-41928-checkpoint-04.md',
      'utf8',
    );
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(1000000);
    expect(state.last_stop_nn).toBe('03');
  });

  it('treats v1 2-field state as parse error → resets to 0:0:00', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '5:1000000', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(0);
    expect(state.last_stop_nn).toBe('00');
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toBe('0:0:00');
  });

  it('treats malformed state as parse error → resets to 0:0:00', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), 'bad:data:here', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(0);
    expect(state.last_stop_nn).toBe('00');
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toBe('0:0:00');
  });

  it('writeState writes 3-field format', () => {
    writeState(TOKEN, { count: 2, last_ts: 999, last_stop_nn: '01' }, tmpDir);
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(2);
    expect(state.last_ts).toBe(999);
    expect(state.last_stop_nn).toBe('01');
  });
});

// ---------------------------------------------------------------------------
// handleReset
// ---------------------------------------------------------------------------

describe('handleReset', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes 0:<now>:00 to state file', async () => {
    const now = 1700000000;
    const cap = captureStdout();
    handleReset(TOKEN, now, tmpDir);
    const out = cap.stop();
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toBe(`0:${now}:00`);
    expect(out).toBe('');
  });

  it('overwrites existing v1 state file cleanly', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '99:123456789', 'utf8');
    const now = 1700000001;
    handleReset(TOKEN, now, tmpDir);
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toBe(`0:${now}:00`);
  });

  it('overwrites legacy 4-field state — slot 4 dropped on reset', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '5:1000:03:1', 'utf8');
    handleReset(TOKEN, 1700000000, tmpDir);
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_stop_nn).toBe('00');
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toBe('0:1700000000:00'); // 3 fields
  });

  it('produces no stdout', () => {
    const cap = captureStdout();
    handleReset(TOKEN, 1000000, tmpDir);
    const out = cap.stop();
    expect(out).toBe('');
  });
});

// ---------------------------------------------------------------------------
// handleStop
// ---------------------------------------------------------------------------

describe('handleStop', () => {
  let tmpDir: string;
  let vaultDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    vaultDir = await makeTmpDir();
    await writeFile(join(vaultDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(vaultDir, { recursive: true, force: true });
  });

  it('SKIP_WINDOW: count=0 and last_ts within 60s → exit 0, state unchanged', async () => {
    const now = 1700000100;
    const recentTs = now - 30; // 30s ago
    writeState(TOKEN, { count: 0, last_ts: recentTs, last_stop_nn: '01' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(recentTs);
  });

  it('SKIP_WINDOW: count=0 but last_ts > 60s ago → NOT skipped, count increments to 1', () => {
    const now = 1700000100;
    const oldTs = now - 90; // 90s ago
    writeState(TOKEN, { count: 0, last_ts: oldTs, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    cap.stop();

    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(1);
    expect(state.last_ts).toBe(oldTs); // preserved when threshold not met / min_activity guard
  });

  it('threshold not met → no stdout, state updated with incremented count', () => {
    const now = 1700000100;
    writeState(TOKEN, { count: 2, last_ts: now - 10, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(3); // incremented
  });

  it('MIN_ACTIVITY guard: count increments to 1, threshold met by time, but no emit', () => {
    const now = 1700001000;
    const oldTs = now - 700; // 700s > 600s threshold
    writeState(TOKEN, { count: 0, last_ts: oldTs, last_stop_nn: '01' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(1);
  });

  it('threshold met (messages) → emits block with NN and since suffix', async () => {
    const now = 1700001000;
    await createCheckpointFile(vaultDir, now, TOKEN, 1);
    writeState(TOKEN, { count: 4, last_ts: now - 10, last_stop_nn: '01' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe('02 since checkpoint-01');
  });

  it('threshold met → state reset (count=0, last_ts=now)', async () => {
    const now = 1700001000;
    writeState(TOKEN, { count: 4, last_ts: now - 10, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    cap.stop();

    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(now);
  });

  it('NN derivation: disk scan is authoritative over state last_stop_nn', async () => {
    const now = 1700001000;
    await createCheckpointFile(vaultDir, now, TOKEN, 1);
    writeState(TOKEN, { count: 4, last_ts: now - 10, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe('02 since checkpoint-01');
    const state = readState(TOKEN, tmpDir);
    expect(state.last_stop_nn).toBe('02');
  });

  it('elapsed calc: last_ts=0 → elapsed=0, never triggers time threshold alone', () => {
    const now = 1700001000;
    writeState(TOKEN, { count: 1, last_ts: 0, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(2);
  });

  it('precompact-then-stop same turn: count=0, not in SKIP_WINDOW → count=1, below MIN_ACTIVITY, no emit', () => {
    const now = 1700002000;
    const oldTs = now - 900;
    writeState(TOKEN, { count: 0, last_ts: oldTs, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(1);
  });

  it('no state file (first run): count starts at 0, increments to 1, no emit', () => {
    const now = 1700000000;
    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    cap.stop();
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(1);
  });

  it('last_ts=0 + count=4 → decision:block, last_ts updated, last_stop_nn incremented', async () => {
    const now = 1700000800;
    await createCheckpointFile(vaultDir, now, TOKEN, 1);
    await createCheckpointFile(vaultDir, now, TOKEN, 2);
    writeState(TOKEN, { count: 4, last_ts: 0, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');

    const state = readState(TOKEN, tmpDir);
    expect(state.last_ts).toBe(now);
    expect(state.last_stop_nn).toBe('03');
  });

  it('last_ts=0 + count=0 → SKIP_WINDOW does NOT fire (guard needs last_ts > 0)', () => {
    const now = 1700001500;
    writeState(TOKEN, { count: 0, last_ts: 0, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(1);
    expect(state.last_ts).toBe(0);
  });

  it('falls back to defaults when vault.yml is missing (messages=15, minutes=30)', () => {
    const emptyVault = tmpDir; // no vault.yml
    const now = 1700001000;
    writeState(TOKEN, { count: 14, last_ts: now - 10, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, emptyVault, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
  });
});

// ---------------------------------------------------------------------------
// Unicode round-trip in checkpoint files
// ---------------------------------------------------------------------------

describe('unicode in checkpoint files', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('checkpoint file with unicode body (✅ ❌ →) is written and read back losslessly', async () => {
    const now = 1700001000;
    const d = new Date(now * 1000);
    const yyyy = d.getFullYear().toString();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const date = `${yyyy}-${mm}-${dd}`;
    const dir = join(tmpDir, '07-logs', yyyy, mm);
    await mkdir(dir, { recursive: true });

    const unicodeBody = [
      '---',
      'tags: [checkpoint, session-log]',
      `date: ${date}`,
      'checkpoint: 01',
      'merged: false',
      '---',
      '',
      '## What We Worked On',
      'Refactored the session init flow → improved startup speed.',
      '',
      "## What Worked / Didn't Work",
      '- ✅ Session token resolves correctly',
      '- ❌ Stale state file cleanup had edge case',
      '',
      '## Action Items',
      `- [ ] Fix stale state cleanup 📅 ${date}`,
    ].join('\n');

    const filePath = join(dir, `${date}-${TOKEN}-checkpoint-01.md`);
    await writeFile(filePath, unicodeBody, 'utf8');

    // Read back via Bun.file (same API used internally by checkpoint code)
    const readBack = await Bun.file(filePath).text();
    expect(readBack).toBe(unicodeBody);

    // Verify specific unicode characters survived
    expect(readBack).toContain('→');
    expect(readBack).toContain('✅');
    expect(readBack).toContain('❌');
  });

  it('state file with token containing only ASCII — content is valid UTF-8', async () => {
    const now = 1700001000;
    writeState(TOKEN, { count: 3, last_ts: now, last_stop_nn: '02' }, tmpDir);

    const stateContent = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    // State file is ASCII, so it's trivially valid UTF-8
    const encoded = new TextEncoder().encode(stateContent);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(encoded);
    expect(decoded).toBe(stateContent);
  });
});

// ---------------------------------------------------------------------------
// maxCheckpointNnSync
// ---------------------------------------------------------------------------

describe('maxCheckpointNnSync', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const VAULT = () => tmpDir;
  const DATE = '2023-11-14';
  const LOGS = '07-logs';

  it('returns 0 when no checkpoint files exist', () => {
    const result = maxCheckpointNnSync(VAULT(), DATE, TOKEN, LOGS);
    expect(result).toBe(0);
  });

  it('returns max NN from checkpoint files on disk', async () => {
    const dir = join(VAULT(), LOGS, '2023', '11');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${DATE}-${TOKEN}-checkpoint-01.md`), '', 'utf8');
    await writeFile(join(dir, `${DATE}-${TOKEN}-checkpoint-03.md`), '', 'utf8');
    const result = maxCheckpointNnSync(VAULT(), DATE, TOKEN, LOGS);
    expect(result).toBe(3);
  });

  it('ignores files for other tokens', async () => {
    const dir = join(VAULT(), LOGS, '2023', '11');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${DATE}-99999-checkpoint-05.md`), '', 'utf8');
    const result = maxCheckpointNnSync(VAULT(), DATE, TOKEN, LOGS);
    expect(result).toBe(0);
  });

  it('ignores files for other dates', async () => {
    const dir = join(VAULT(), LOGS, '2023', '11');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `2023-11-15-${TOKEN}-checkpoint-02.md`), '', 'utf8');
    const result = maxCheckpointNnSync(VAULT(), DATE, TOKEN, LOGS);
    expect(result).toBe(0);
  });
});
