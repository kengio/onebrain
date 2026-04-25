/**
 * checkpoint.test.ts — tests for checkpoint command (stop/precompact/postcompact/reset)
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handlePostcompact,
  handlePrecompact,
  handleReset,
  handleStop,
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

async function readStateRaw(tmpDir: string, token: string): Promise<string> {
  return readFile(stateFile(tmpDir, token), 'utf8');
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
    expect(state.pending_stub).toBeUndefined();
  });

  it('reads 3-field state correctly', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '3:1000000:02', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(3);
    expect(state.last_ts).toBe(1000000);
    expect(state.last_stop_nn).toBe('02');
    expect(state.pending_stub).toBeUndefined();
  });

  it('reads 4-field state (pending_stub) correctly', async () => {
    await writeFile(
      stateFile(tmpDir, TOKEN),
      '0:1000000:03:2026-04-23-41928-checkpoint-04.md',
      'utf8',
    );
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(1000000);
    expect(state.last_stop_nn).toBe('03');
    expect(state.pending_stub).toBe('2026-04-23-41928-checkpoint-04.md');
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

  it('writeState writes 3-field format when no pending_stub', () => {
    writeState(TOKEN, { count: 2, last_ts: 999, last_stop_nn: '01' }, tmpDir);
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(2);
    expect(state.last_ts).toBe(999);
    expect(state.last_stop_nn).toBe('01');
    expect(state.pending_stub).toBeUndefined();
  });

  it('writeState writes 4-field format when pending_stub is set', () => {
    writeState(
      TOKEN,
      { count: 0, last_ts: 999, last_stop_nn: '02', pending_stub: 'some-file.md' },
      tmpDir,
    );
    const state = readState(TOKEN, tmpDir);
    expect(state.pending_stub).toBe('some-file.md');
    expect(state.last_stop_nn).toBe('02');
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
    const raw = await readStateRaw(tmpDir, TOKEN);
    expect(raw).toBe(`0:${now}:00`);
    expect(out).toBe('');
  });

  it('overwrites existing v1 state file cleanly', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '99:123456789', 'utf8');
    const now = 1700000001;
    handleReset(TOKEN, now, tmpDir);
    const raw = await readStateRaw(tmpDir, TOKEN);
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
    // State should be unchanged
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

    // count should be 1 (below MIN_ACTIVITY=2, no emit, but state updated)
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(1);
    expect(state.last_ts).toBe(oldTs); // preserved when threshold not met / min_activity guard
  });

  it('threshold not met → no stdout, state updated with incremented count', () => {
    // messages_threshold=5, count=2, elapsed small
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
    // Even if elapsed > threshold, count < 2 → no emit
    // messages_threshold=5, minutes_threshold=10min=600s
    const now = 1700001000;
    const oldTs = now - 700; // 700s > 600s threshold
    writeState(TOKEN, { count: 0, last_ts: oldTs, last_stop_nn: '01' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(1); // incremented but no emit
  });

  it('threshold met by count (count reaches messages_threshold), emits block JSON', () => {
    // count=4, after increment = 5 = messages_threshold
    const now = 1700000500;
    writeState(TOKEN, { count: 4, last_ts: now - 10, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    // reason contains filename "since start" (last_stop_nn was '00')
    expect(parsed.reason).toMatch(/checkpoint-01\.md since start$/);

    // State reset: count=0, last_ts=now, last_stop_nn='01'
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(now);
    expect(state.last_stop_nn).toBe('01');
  });

  // Update snapshots: bun test --update-snapshots
  it('stop block JSON shape matches snapshot { decision: "block", reason: "...-checkpoint-NN.md since ..." }', () => {
    // count=4 → increment to 5 = messages_threshold → emit block
    const now = 1700001500;
    writeState(TOKEN, { count: 4, last_ts: now - 10, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim()) as Record<string, unknown>;

    // Lock the field names of the block decision shape.
    expect(Object.keys(parsed).sort()).toMatchSnapshot();
    // Lock the decision value ("block" is the only valid value).
    expect(parsed.decision).toMatchSnapshot();
    // Lock the reason pattern: must contain a checkpoint filename and a "since" clause.
    expect(typeof parsed.reason).toMatchSnapshot();
    expect(String(parsed.reason)).toMatch(/-checkpoint-\d{2}\.md since /);
  });

  it('threshold met by elapsed time, emits block JSON', () => {
    // elapsed > minutes_threshold (10 min = 600s), count >= 2
    const now = 1700001000;
    const oldTs = now - 700; // 700s elapsed
    writeState(TOKEN, { count: 2, last_ts: oldTs, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toMatch(/checkpoint-03\.md since checkpoint-02$/);

    const state = readState(TOKEN, tmpDir);
    expect(state.last_stop_nn).toBe('03');
  });

  it('"since start" format when last_stop_nn is "00"', () => {
    const now = 1700001000;
    writeState(TOKEN, { count: 4, last_ts: now - 10, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.reason).toMatch(/since start$/);
  });

  it('"since checkpoint-NN" format when last_stop_nn is non-zero', () => {
    const now = 1700001000;
    writeState(TOKEN, { count: 4, last_ts: now - 10, last_stop_nn: '03' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.reason).toMatch(/since checkpoint-03$/);
    // next NN should be 04
    expect(parsed.reason).toMatch(/checkpoint-04\.md/);
  });

  it('elapsed calc: last_ts=0 → elapsed=0, never triggers time threshold alone', () => {
    const now = 1700001000;
    // last_ts=0 sentinel (post-compact), count=1 (below min_activity)
    writeState(TOKEN, { count: 1, last_ts: 0, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    // count becomes 2, but elapsed=0 so time threshold not met, count=2 < 5 messages threshold
    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(2);
  });

  it('precompact-then-stop same turn: count=0, not in SKIP_WINDOW → count=1, below MIN_ACTIVITY, no emit', () => {
    // precompact sets count=0 but does NOT update last_ts; last_ts is old
    const now = 1700002000;
    const oldTs = now - 900; // old, not in skip window
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

  it('last_ts=0 + count=4 (below threshold=5 after increment to 5) → decision:block, last_ts updated, last_stop_nn incremented', () => {
    // messagesThreshold is 5 from vault.yml; count=4 → increment to 5 = threshold → emit
    const now = 1700000800;
    writeState(TOKEN, { count: 4, last_ts: 0, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');

    const state = readState(TOKEN, tmpDir);
    // last_ts must have been updated (was 0, now should be `now`)
    expect(state.last_ts).toBe(now);
    expect(state.last_stop_nn).toBe('03');
  });

  it('last_ts=0 + count=0 → SKIP_WINDOW does NOT fire (guard needs last_ts > 0), out is empty, count increments to 1, last_ts stays 0', () => {
    // last_ts=0 → the SKIP_WINDOW guard (last_ts > 0 && elapsed < 60) does not fire
    // count=0 increments to 1, below MIN_ACTIVITY=2 → no emit
    const now = 1700001500;
    writeState(TOKEN, { count: 0, last_ts: 0, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(1);
    // last_ts stays 0 when threshold not met
    expect(state.last_ts).toBe(0);
  });

  it('falls back to defaults when vault.yml is missing (messages=15, minutes=30)', () => {
    // vaultDir has no vault.yml — use separate dir
    const emptyVault = tmpDir; // no vault.yml
    const now = 1700001000;
    // count=14 → should NOT emit (threshold=15)
    writeState(TOKEN, { count: 14, last_ts: now - 10, last_stop_nn: '00' }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, emptyVault, now, tmpDir);
    const out = cap.stop();

    // With default threshold=15, count=15 after increment → EMIT
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

  it('recent checkpoint (last_ts within 5min) → exit 0, no stub file, state unchanged', async () => {
    const now = 1700001000;
    const recentTs = now - 100; // 100s < 300s
    writeState(TOKEN, { count: 0, last_ts: recentTs, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    await handlePrecompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.last_stop_nn).toBe('02'); // unchanged
    expect(state.pending_stub).toBeUndefined();
  });

  it('no recent checkpoint → writes stub file and updates state to 4-field format', async () => {
    const now = 1700001000;
    const oldTs = now - 600; // 600s > 300s
    writeState(TOKEN, { count: 3, last_ts: oldTs, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    await handlePrecompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');

    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(oldTs); // NOT updated by precompact
    expect(state.last_stop_nn).toBe('02'); // NOT incremented
    expect(state.pending_stub).toBeTruthy();
    // stub NN should be 03 (last_stop_nn '02' + 1)
    expect(state.pending_stub).toMatch(/checkpoint-03\.md$/);
  });

  it('NN derivation: last_stop_nn="02" → stub NN="03"', async () => {
    const now = 1700001000;
    writeState(TOKEN, { count: 2, last_ts: now - 600, last_stop_nn: '02' }, tmpDir);

    await handlePrecompact(TOKEN, vaultDir, now, tmpDir);

    const state = readState(TOKEN, tmpDir);
    expect(state.pending_stub).toMatch(/-checkpoint-03\.md$/);
  });

  it('stub file is actually written to vault logs dir', async () => {
    const now = 1700001000;
    const date = new Date(now * 1000);
    const yyyy = date.getFullYear().toString();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    writeState(TOKEN, { count: 2, last_ts: now - 600, last_stop_nn: '00' }, tmpDir);

    await handlePrecompact(TOKEN, vaultDir, now, tmpDir);

    const state = readState(TOKEN, tmpDir);
    const stubFilename = state.pending_stub ?? '';
    expect(stubFilename).toBeTruthy();
    const stubPath = join(vaultDir, '07-logs', yyyy, mm, stubFilename);
    const content = await readFile(stubPath, 'utf8');
    expect(content).toContain('trigger: precompact');
    expect(content).toContain('merged: false');
    expect(content).toContain('## What We Worked On');
  });

  it('stub frontmatter checkpoint: field preserves zero-padding (e.g. "03" not 3)', async () => {
    const now = 1700001000;
    const date = new Date(now * 1000);
    const yyyy = date.getFullYear().toString();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    // last_stop_nn='02' → stub NN='03'
    writeState(TOKEN, { count: 2, last_ts: now - 600, last_stop_nn: '02' }, tmpDir);

    await handlePrecompact(TOKEN, vaultDir, now, tmpDir);

    const state = readState(TOKEN, tmpDir);
    const stubFilename = state.pending_stub ?? '';
    const stubPath = join(vaultDir, '07-logs', yyyy, mm, stubFilename);
    const content = await readFile(stubPath, 'utf8');
    // Must contain 'checkpoint: 03' (zero-padded), NOT 'checkpoint: 3'
    expect(content).toContain('checkpoint: 03');
    expect(content).not.toContain('checkpoint: 3\n');
  });

  it('last_stop_nn NOT updated (stays same in state after precompact)', async () => {
    const now = 1700001000;
    writeState(TOKEN, { count: 2, last_ts: now - 600, last_stop_nn: '03' }, tmpDir);

    await handlePrecompact(TOKEN, vaultDir, now, tmpDir);

    const state = readState(TOKEN, tmpDir);
    expect(state.last_stop_nn).toBe('03');
    expect(state.pending_stub).toMatch(/-checkpoint-04\.md$/);
  });

  it('no state file (last_ts=0) → recency check fails → writes stub for new session', async () => {
    // No state file → readState returns last_ts=0 → recency guard (last_ts > 0) is false
    // → precompact proceeds and writes a stub (correct: compact on brand-new session)
    const now = 1700001000;
    const cap = captureStdout();
    await handlePrecompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.pending_stub).toBeTruthy();
    expect(state.pending_stub).toMatch(/-checkpoint-01\.md$/);
  });

  it('stop-then-autocompact: precompact no-ops within 5 min of stop checkpoint', async () => {
    // Step 1: arrange state where stop threshold is met → stop writes checkpoint, last_ts = now
    const now = 1700001000;
    writeState(TOKEN, { count: 4, last_ts: now - 10, last_stop_nn: '02' }, tmpDir);

    // handleStop emits block JSON and resets state with last_ts = now
    const cap1 = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    cap1.stop(); // discard the block output

    // Confirm stop updated last_ts to now
    const stateAfterStop = readState(TOKEN, tmpDir);
    expect(stateAfterStop.last_ts).toBe(now);
    expect(stateAfterStop.count).toBe(0);

    // Step 2: precompact fires 60s later (still within PRECOMPACT_RECENCY = 300s)
    const nowPlus60 = now + 60;
    const cap2 = captureStdout();
    await handlePrecompact(TOKEN, vaultDir, nowPlus60, tmpDir);
    const out2 = cap2.stop();

    // Assert: precompact no-ops — no stdout, no stub written
    expect(out2).toBe('');
    const stateAfterPrecompact = readState(TOKEN, tmpDir);
    expect(stateAfterPrecompact.pending_stub).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handlePostcompact
// ---------------------------------------------------------------------------

describe('handlePostcompact', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('no pending stub (3-field state) → preserve last_ts, write 3-field, no stdout', async () => {
    const now = 1700001000;
    const ts = 1699999000;
    writeState(TOKEN, { count: 2, last_ts: ts, last_stop_nn: '02' }, tmpDir);

    const cap = captureStdout();
    handlePostcompact(TOKEN, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const raw = await readStateRaw(tmpDir, TOKEN);
    // 3-field, last_ts preserved
    expect(raw).toBe(`0:${ts}:02`);
  });

  it('no state file → write 3-field with last_ts=0, no stdout', () => {
    const now = 1700001000;
    const cap = captureStdout();
    handlePostcompact(TOKEN, now, tmpDir);
    const out = cap.stop();
    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(0);
  });

  it('pending stub found → emit fill-checkpoint block, clear pending_stub, last_ts=0', async () => {
    const now = 1700001000;
    const ts = 1699999000;
    writeState(
      TOKEN,
      {
        count: 0,
        last_ts: ts,
        last_stop_nn: '02',
        pending_stub: '2026-04-23-41928-checkpoint-03.md',
      },
      tmpDir,
    );

    const cap = captureStdout();
    handlePostcompact(TOKEN, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('fill-checkpoint:');
    expect(parsed.reason).toContain('checkpoint-03.md');
    expect(parsed.reason).toMatch(/since checkpoint-02$/);

    // State cleared: last_ts=0, pending_stub gone
    const raw = await readStateRaw(tmpDir, TOKEN);
    expect(raw).toBe('0:0:02');
  });

  it('"since start" format when last_stop_nn="00"', () => {
    writeState(
      TOKEN,
      {
        count: 0,
        last_ts: 1699999000,
        last_stop_nn: '00',
        pending_stub: '2026-04-23-41928-checkpoint-01.md',
      },
      tmpDir,
    );

    const cap = captureStdout();
    handlePostcompact(TOKEN, 1700001000, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.reason).toMatch(/since start$/);
  });

  it('"since checkpoint-NN" format when last_stop_nn non-zero', () => {
    writeState(
      TOKEN,
      {
        count: 0,
        last_ts: 1699999000,
        last_stop_nn: '03',
        pending_stub: '2026-04-23-41928-checkpoint-04.md',
      },
      tmpDir,
    );

    const cap = captureStdout();
    handlePostcompact(TOKEN, 1700001000, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.reason).toMatch(/since checkpoint-03$/);
  });

  it('missing stub file on disk → still emit fill-checkpoint (Claude creates it)', () => {
    // Stub filename referenced in state but no actual file on disk
    writeState(
      TOKEN,
      {
        count: 0,
        last_ts: 1699999000,
        last_stop_nn: '01',
        pending_stub: 'nonexistent-checkpoint-02.md',
      },
      tmpDir,
    );

    const cap = captureStdout();
    handlePostcompact(TOKEN, 1700001000, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('fill-checkpoint:');
  });

  it('4-field state with empty pending_stub → treat as no pending stub', async () => {
    // Manually write edge case: 4-field with empty 4th
    await writeFile(stateFile(tmpDir, TOKEN), '0:1699999000:02:', 'utf8');

    const cap = captureStdout();
    handlePostcompact(TOKEN, 1700001000, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
  });
});
