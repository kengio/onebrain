/**
 * checkpoint.test.ts — tests for checkpoint command (stop/precompact/postcompact/reset)
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handlePostcompact,
  handlePrecompact,
  handleReset,
  handleStop,
  maxCheckpointNnSync,
  postcompactFallback,
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

  it('reads 4-field legacy state — ignores pending_stub field', async () => {
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
    // Verify file was eagerly rewritten on disk with 3-field format
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toMatch(/^0:\d+:00$/);
  });

  it('treats malformed state as parse error → resets to 0:0:00', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), 'bad:data:here', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(0);
    expect(state.last_stop_nn).toBe('00');
    // Verify file was eagerly rewritten on disk with 3-field format
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toMatch(/^0:\d+:00$/);
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

  it('threshold met (messages) → emits block with correct filename', async () => {
    const now = 1700001000;
    await createCheckpointFile(vaultDir, now, TOKEN, 1);
    writeState(TOKEN, { count: 4, last_ts: now - 10, last_stop_nn: '01' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toMatch(/checkpoint-02\.md since checkpoint-01$/);
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
    expect(parsed.reason).toMatch(/checkpoint-02\.md since checkpoint-01$/);
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
// handlePrecompact
// ---------------------------------------------------------------------------

describe('handlePrecompact', () => {
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

  it('recent checkpoint (last_ts within 5min) → no-op, state unchanged', () => {
    const now = 1700001000;
    const recentTs = now - 100; // 100s < 300s
    writeState(TOKEN, { count: 3, last_ts: recentTs, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    handlePrecompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.last_stop_nn).toBe('02'); // unchanged
    expect(state.count).toBe(3); // unchanged
  });

  it('no recent checkpoint → resets count to 0, preserves last_ts and last_stop_nn', () => {
    const now = 1700001000;
    const oldTs = now - 600; // 600s > 300s
    writeState(TOKEN, { count: 3, last_ts: oldTs, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    handlePrecompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(oldTs); // NOT updated by precompact
    expect(state.last_stop_nn).toBe('02'); // NOT changed
  });

  it('no state file (last_ts=0) → recency guard fails → resets count', () => {
    const now = 1700001000;
    const cap = captureStdout();
    handlePrecompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
  });

  it('stop-then-autocompact: precompact no-ops within 5 min of stop checkpoint', () => {
    const now = 1700001000;
    writeState(TOKEN, { count: 4, last_ts: now - 10, last_stop_nn: '02' }, tmpDir);

    const cap1 = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    cap1.stop();

    const stateAfterStop = readState(TOKEN, tmpDir);
    expect(stateAfterStop.last_ts).toBe(now);
    expect(stateAfterStop.count).toBe(0);

    const nowPlus60 = now + 60;
    const cap2 = captureStdout();
    handlePrecompact(TOKEN, vaultDir, nowPlus60, tmpDir);
    const out2 = cap2.stop();

    expect(out2).toBe('');
    const stateAfterPrecompact = readState(TOKEN, tmpDir);
    expect(stateAfterPrecompact.count).toBe(0);
    expect(stateAfterPrecompact.last_ts).toBe(now); // unchanged
  });

  it('produces no stdout in any case', () => {
    const now = 1700001000;
    writeState(TOKEN, { count: 3, last_ts: now - 600, last_stop_nn: '01' }, tmpDir);
    const cap = captureStdout();
    handlePrecompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    expect(out).toBe('');
  });
});

// ---------------------------------------------------------------------------
// handlePostcompact
// ---------------------------------------------------------------------------

describe('handlePostcompact', () => {
  let tmpDir: string;
  let vaultDir: string;
  const now = 1700001000;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    vaultDir = await makeTmpDir();
    await writeFile(join(vaultDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(vaultDir, { recursive: true, force: true });
  });

  it('no recent checkpoint → emits auto-wrapup block with token', () => {
    const oldTs = now - 600; // > 300s → not recent
    writeState(TOKEN, { count: 0, last_ts: oldTs, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe(`auto-wrapup: ${TOKEN}`);
  });

  it('auto-wrapup emitted → state updated: count=0, last_ts=now, last_stop_nn preserved', () => {
    writeState(TOKEN, { count: 0, last_ts: now - 600, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    cap.stop();

    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(now);
    expect(state.last_stop_nn).toBe('02'); // unchanged
  });

  it('recent checkpoint (< 5 min) → no emit, last_ts preserved', () => {
    const recentTs = now - 100; // < 300s
    writeState(TOKEN, { count: 0, last_ts: recentTs, last_stop_nn: '03' }, tmpDir);

    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.last_ts).toBe(recentTs); // preserved
    expect(state.last_stop_nn).toBe('03');
  });

  it('no state file (last_ts=0) → recency guard fails → emits auto-wrapup', () => {
    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe(`auto-wrapup: ${TOKEN}`);
  });

  it('postcompact last_ts=now blocks precompact re-fire within 5 min', () => {
    writeState(TOKEN, { count: 0, last_ts: now - 600, last_stop_nn: '01' }, tmpDir);

    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    cap.stop();

    const stateAfterPost = readState(TOKEN, tmpDir);
    expect(stateAfterPost.last_ts).toBe(now);

    const cap2 = captureStdout();
    handlePrecompact(TOKEN, vaultDir, now + 30, tmpDir);
    const out2 = cap2.stop();

    expect(out2).toBe('');
    const stateAfterPre = readState(TOKEN, tmpDir);
    expect(stateAfterPre.last_ts).toBe(now); // unchanged
  });

  it('4-field legacy state (pending_stub) → auto-wrapup still emitted', async () => {
    const oldTs = now - 600;
    await writeFile(
      stateFile(tmpDir, TOKEN),
      `0:${oldTs}:02:2026-04-23-${TOKEN}-checkpoint-03.md`,
      'utf8',
    );

    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe(`auto-wrapup: ${TOKEN}`);
  });
});

// ---------------------------------------------------------------------------
// postcompactFallback
// ---------------------------------------------------------------------------

describe('postcompactFallback', () => {
  let tmpDir: string;
  let vaultDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    vaultDir = await makeTmpDir();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(vaultDir, { recursive: true, force: true });
  });

  const now = 1700002000;

  it('emits auto-wrapup when not recent', () => {
    writeState(TOKEN, { count: 0, last_ts: now - 600, last_stop_nn: '02' }, tmpDir);
    const cap = captureStdout();
    postcompactFallback(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe(`auto-wrapup: ${TOKEN}`);
  });

  it('no emit when recent (< 5 min since last checkpoint)', () => {
    writeState(TOKEN, { count: 0, last_ts: now - 100, last_stop_nn: '02' }, tmpDir);
    const cap = captureStdout();
    postcompactFallback(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    expect(out).toBe('');
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
