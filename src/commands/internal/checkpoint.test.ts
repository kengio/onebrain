/**
 * checkpoint.test.ts — tests for checkpoint command (stop/postcompact/reset)
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handlePostcompact,
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
    expect(state.wrapup_pending).toBe(0);
  });

  it('reads 3-field legacy state correctly (wrapup_pending defaults to 0)', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '3:1000000:02', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(3);
    expect(state.last_ts).toBe(1000000);
    expect(state.last_stop_nn).toBe('02');
    expect(state.wrapup_pending).toBe(0);
  });

  it('reads 4-field state with wrapup_pending=1', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '0:1000000:02:1', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.wrapup_pending).toBe(1);
  });

  it('reads 4-field state with wrapup_pending=0', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '0:1000000:02:0', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.wrapup_pending).toBe(0);
  });

  it('reads 4-field legacy pending_stub format → wrapup_pending=0 (filename ≠ "1")', async () => {
    await writeFile(
      stateFile(tmpDir, TOKEN),
      '0:1000000:03:2026-04-23-41928-checkpoint-04.md',
      'utf8',
    );
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(1000000);
    expect(state.last_stop_nn).toBe('03');
    expect(state.wrapup_pending).toBe(0); // legacy non-'1' value treated as no pending
  });

  it('treats v1 2-field state as parse error → resets to 0:0:00:0', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '5:1000000', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(0);
    expect(state.last_stop_nn).toBe('00');
    expect(state.wrapup_pending).toBe(0);
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toBe('0:0:00:0');
  });

  it('treats malformed state as parse error → resets to 0:0:00:0', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), 'bad:data:here', 'utf8');
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(0);
    expect(state.last_stop_nn).toBe('00');
    expect(state.wrapup_pending).toBe(0);
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toBe('0:0:00:0');
  });

  it('writeState writes 4-field format including wrapup_pending', () => {
    writeState(TOKEN, { count: 2, last_ts: 999, last_stop_nn: '01', wrapup_pending: 1 }, tmpDir);
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(2);
    expect(state.last_ts).toBe(999);
    expect(state.last_stop_nn).toBe('01');
    expect(state.wrapup_pending).toBe(1);
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

  it('writes 0:<now>:00:0 to state file (clears count, NN, AND wrapup_pending)', async () => {
    const now = 1700000000;
    const cap = captureStdout();
    handleReset(TOKEN, now, tmpDir);
    const out = cap.stop();
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toBe(`0:${now}:00:0`);
    expect(out).toBe('');
  });

  it('overwrites existing v1 state file cleanly', async () => {
    await writeFile(stateFile(tmpDir, TOKEN), '99:123456789', 'utf8');
    const now = 1700000001;
    handleReset(TOKEN, now, tmpDir);
    const raw = await Bun.file(stateFile(tmpDir, TOKEN)).text();
    expect(raw).toBe(`0:${now}:00:0`);
  });

  it('clears wrapup_pending=1 to 0 — fresh start for next checkpoint cycle', async () => {
    // /wrapup just wrote a session log; the auto-wrapup flag must be cleared
    // so the next Stop hook firing doesn't re-emit auto-wrapup and dispatch
    // a duplicate session log.
    writeState(TOKEN, { count: 5, last_ts: 1000, last_stop_nn: '03', wrapup_pending: 1 }, tmpDir);
    handleReset(TOKEN, 1700000000, tmpDir);
    const state = readState(TOKEN, tmpDir);
    expect(state.wrapup_pending).toBe(0);
    expect(state.count).toBe(0);
    expect(state.last_stop_nn).toBe('00');
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
    writeState(
      TOKEN,
      { count: 0, last_ts: recentTs, last_stop_nn: '01', wrapup_pending: 0 },
      tmpDir,
    );

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
    writeState(TOKEN, { count: 0, last_ts: oldTs, last_stop_nn: '00', wrapup_pending: 0 }, tmpDir);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    cap.stop();

    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(1);
    expect(state.last_ts).toBe(oldTs); // preserved when threshold not met / min_activity guard
  });

  it('threshold not met → no stdout, state updated with incremented count', () => {
    const now = 1700000100;
    writeState(
      TOKEN,
      { count: 2, last_ts: now - 10, last_stop_nn: '00', wrapup_pending: 0 },
      tmpDir,
    );

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
    writeState(TOKEN, { count: 0, last_ts: oldTs, last_stop_nn: '01', wrapup_pending: 0 }, tmpDir);

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
    writeState(
      TOKEN,
      { count: 4, last_ts: now - 10, last_stop_nn: '01', wrapup_pending: 0 },
      tmpDir,
    );

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe('02 since checkpoint-01');
  });

  it('threshold met → state reset (count=0, last_ts=now)', async () => {
    const now = 1700001000;
    writeState(
      TOKEN,
      { count: 4, last_ts: now - 10, last_stop_nn: '00', wrapup_pending: 0 },
      tmpDir,
    );

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
    writeState(
      TOKEN,
      { count: 4, last_ts: now - 10, last_stop_nn: '02', wrapup_pending: 0 },
      tmpDir,
    );

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
    writeState(TOKEN, { count: 1, last_ts: 0, last_stop_nn: '00', wrapup_pending: 0 }, tmpDir);

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
    writeState(TOKEN, { count: 0, last_ts: oldTs, last_stop_nn: '02', wrapup_pending: 0 }, tmpDir);

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
    writeState(TOKEN, { count: 4, last_ts: 0, last_stop_nn: '02', wrapup_pending: 0 }, tmpDir);

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
    writeState(TOKEN, { count: 0, last_ts: 0, last_stop_nn: '00', wrapup_pending: 0 }, tmpDir);

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
    writeState(
      TOKEN,
      { count: 14, last_ts: now - 10, last_stop_nn: '00', wrapup_pending: 0 },
      tmpDir,
    );

    const cap = captureStdout();
    handleStop(TOKEN, emptyVault, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim());
    expect(parsed.decision).toBe('block');
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

  it('no recent checkpoint → sets wrapup_pending=1 (silent stdout)', () => {
    const oldTs = now - 600; // > 300s → not recent
    writeState(TOKEN, { count: 0, last_ts: oldTs, last_stop_nn: '02', wrapup_pending: 0 }, tmpDir);

    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe(''); // PostCompact stdout cannot reach the agent — must stay silent
    const state = readState(TOKEN, tmpDir);
    expect(state.wrapup_pending).toBe(1);
    expect(state.last_ts).toBe(now);
  });

  it('signal set → state updated: count=0, last_ts=now, last_stop_nn preserved', () => {
    writeState(
      TOKEN,
      { count: 0, last_ts: now - 600, last_stop_nn: '02', wrapup_pending: 0 },
      tmpDir,
    );

    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    cap.stop();

    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(0);
    expect(state.last_ts).toBe(now);
    expect(state.last_stop_nn).toBe('02'); // unchanged
    expect(state.wrapup_pending).toBe(1);
  });

  it('recent checkpoint (< 5 min) → wrapup_pending stays 0, last_ts preserved', () => {
    const recentTs = now - 100; // < 300s
    writeState(
      TOKEN,
      { count: 0, last_ts: recentTs, last_stop_nn: '03', wrapup_pending: 0 },
      tmpDir,
    );

    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.last_ts).toBe(recentTs); // preserved
    expect(state.last_stop_nn).toBe('03');
    expect(state.wrapup_pending).toBe(0);
  });

  it('no state file (last_ts=0) → recency guard fails → wrapup_pending set', () => {
    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.wrapup_pending).toBe(1);
  });

  it('postcompact resets last_ts to now and count to 0 — state ready for next session', () => {
    writeState(
      TOKEN,
      { count: 0, last_ts: now - 600, last_stop_nn: '01', wrapup_pending: 0 },
      tmpDir,
    );

    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    cap.stop();

    const state = readState(TOKEN, tmpDir);
    expect(state.last_ts).toBe(now);
    expect(state.count).toBe(0);
  });

  it('4-field legacy state (pending_stub filename) → wrapup_pending set on next compact', async () => {
    const oldTs = now - 600;
    await writeFile(
      stateFile(tmpDir, TOKEN),
      `0:${oldTs}:02:2026-04-23-${TOKEN}-checkpoint-03.md`,
      'utf8',
    );

    const cap = captureStdout();
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe('');
    const state = readState(TOKEN, tmpDir);
    expect(state.wrapup_pending).toBe(1);
  });

  it('PostCompact fires twice within recency window → wrapup_pending preserved (signal survives)', () => {
    // First /compact sets wrapup_pending=1. User immediately runs /compact again
    // (e.g., accidentally double-tapped). The second PostCompact must NOT clear
    // the flag — the signal hasn't been consumed yet by UserPromptSubmit.
    writeState(
      TOKEN,
      { count: 0, last_ts: now - 600, last_stop_nn: '02', wrapup_pending: 0 },
      tmpDir,
    );
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    expect(readState(TOKEN, tmpDir).wrapup_pending).toBe(1); // first call set it

    // Second compact within 5 min — recency guard hits. Must preserve the flag.
    handlePostcompact(TOKEN, vaultDir, now + 60, tmpDir);
    expect(readState(TOKEN, tmpDir).wrapup_pending).toBe(1); // still set
  });

  it('recency-guard skip preserves all state on disk (no overwrite)', () => {
    // The recency-skip branch is a true no-op — it does not rewrite state.
    // Cross-session staleness is handled by the 24h TTL guard in
    // handleUserPromptSubmit, not by clearing the flag here.
    writeState(
      TOKEN,
      { count: 3, last_ts: now - 100, last_stop_nn: '04', wrapup_pending: 1 },
      tmpDir,
    );
    handlePostcompact(TOKEN, vaultDir, now, tmpDir);
    const state = readState(TOKEN, tmpDir);
    expect(state.count).toBe(3);
    expect(state.last_ts).toBe(now - 100);
    expect(state.last_stop_nn).toBe('04');
    expect(state.wrapup_pending).toBe(1);
  });

  it('writeState failure leaves on-disk state unchanged — next compact can retry', () => {
    writeState(
      TOKEN,
      { count: 0, last_ts: now - 600, last_stop_nn: '02', wrapup_pending: 0 },
      tmpDir,
    );
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (() => true) as typeof process.stderr.write;

    // Use a non-existent tmpDir to force writeFileSync ENOENT.
    const badTmpDir = join(tmpDir, 'does', 'not', 'exist');
    handlePostcompact(TOKEN, vaultDir, now, badTmpDir);
    process.stderr.write = originalWrite;

    // Original tmpDir's state must be untouched (write went to badTmpDir
    // and failed). last_ts still old → next PostCompact's recency guard
    // does not skip → retry succeeds.
    const state = readState(TOKEN, tmpDir);
    expect(state.last_ts).toBe(now - 600);
    expect(state.wrapup_pending).toBe(0);
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

  it('sets wrapup_pending when not recent', () => {
    writeState(
      TOKEN,
      { count: 0, last_ts: now - 600, last_stop_nn: '02', wrapup_pending: 0 },
      tmpDir,
    );
    const cap = captureStdout();
    postcompactFallback(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    expect(out).toBe('');
    expect(readState(TOKEN, tmpDir).wrapup_pending).toBe(1);
  });

  it('no signal when recent (< 5 min since last checkpoint)', () => {
    writeState(
      TOKEN,
      { count: 0, last_ts: now - 100, last_stop_nn: '02', wrapup_pending: 0 },
      tmpDir,
    );
    const cap = captureStdout();
    postcompactFallback(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    expect(out).toBe('');
    expect(readState(TOKEN, tmpDir).wrapup_pending).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleStop wrapup branch (PostCompact follow-up signal)
// ---------------------------------------------------------------------------

describe('handleStop wrapup branch', () => {
  let tmpDir: string;
  let vaultDir: string;
  const now = 1700004000;

  beforeEach(async () => {
    tmpDir = await makeTmpDir();
    vaultDir = await makeTmpDir();
    await writeFile(join(vaultDir, 'vault.yml'), VALID_VAULT_YML, 'utf8');
  });
  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    await rm(vaultDir, { recursive: true, force: true });
  });

  function setPending(ts: number, pending: 0 | 1 = 1, lastStopNn = '02', count = 0): void {
    writeState(
      TOKEN,
      { count, last_ts: ts, last_stop_nn: lastStopNn, wrapup_pending: pending },
      tmpDir,
    );
  }

  it('wrapup_pending=1 → forces a checkpoint NN emission + clears flag', () => {
    setPending(now);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now + 5, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim()) as { decision: string; reason: string };
    expect(parsed.decision).toBe('block');
    // Uniform reason format with regular checkpoints — no special "auto-wrapup"
    // marker. The agent treats post-compact checkpoints the same as regular ones.
    expect(parsed.reason).toMatch(/^\d{2} since (start|checkpoint-\d{2})$/);

    // Flag consumed; last_ts advanced; last_stop_nn updated to fresh NN.
    const after = readState(TOKEN, tmpDir);
    expect(after.wrapup_pending).toBe(0);
    expect(after.last_ts).toBe(now + 5);
    expect(after.count).toBe(0);
    expect(after.last_stop_nn).not.toBe('02'); // changed (incremented)
  });

  it('post-compact priority bypasses SKIP_WINDOW (a /wrapup just ran would normally skip)', () => {
    // Simulate /wrapup-then-/compact: handleReset wrote count=0 + last_ts=now-30s.
    // Without post-compact priority, SKIP_WINDOW (60s) would suppress this Stop.
    setPending(now - 30, 1, '00', 0);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim()) as { reason: string };
    expect(parsed.reason).toMatch(/^\d{2} since (start|checkpoint-\d{2})$/);
  });

  it('post-compact priority bypasses MIN_ACTIVITY (count<2 normally skips checkpoint)', () => {
    // count=1 is below MIN_ACTIVITY=2; without post-compact priority this Stop
    // would not emit anything.
    setPending(now - 600, 1, '02', 1);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim()) as { reason: string };
    expect(parsed.reason).toMatch(/^\d{2} since (start|checkpoint-\d{2})$/);
  });

  it('wrapup_pending=0 → falls through to regular checkpoint logic', () => {
    // No pending flag — handleStop follows its normal path. Pick last_ts that
    // beats SKIP_WINDOW (60s) but stays within time threshold (10min in
    // VALID_VAULT_YML). Pick count low enough that increment stays below the
    // 5-message threshold.
    setPending(now - 200, 0, '00', 2);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();

    expect(out).toBe(''); // below threshold → no emit
    const after = readState(TOKEN, tmpDir);
    expect(after.wrapup_pending).toBe(0);
    expect(after.count).toBe(3); // incremented from 2 to 3
  });

  it('signal older than 24h is discarded silently — flag cleared, no emit', () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (() => true) as typeof process.stderr.write;
    const yesterday = now - 25 * 60 * 60; // > 24h
    setPending(yesterday);

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    process.stderr.write = originalWrite;

    expect(out).toBe(''); // no directive emitted
    expect(readState(TOKEN, tmpDir).wrapup_pending).toBe(0); // stale flag cleared
  });

  it('signal exactly past TTL boundary (24h + 1s) is discarded', () => {
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (() => true) as typeof process.stderr.write;
    setPending(now - (24 * 60 * 60 + 1));

    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    process.stderr.write = originalWrite;

    expect(out).toBe('');
  });

  it('payload is valid JSON with single trailing newline', () => {
    setPending(now);
    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    expect(out.endsWith('\n')).toBe(true);
    expect(out.trim().split('\n').length).toBe(1);
    expect(() => JSON.parse(out.trim())).not.toThrow();
  });

  it('two consecutive Stop fires: first force-checkpoints, second is SKIP_WINDOW silent', () => {
    setPending(now);

    const cap1 = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out1 = cap1.stop();
    const parsed1 = JSON.parse(out1.trim()) as { reason: string };
    expect(parsed1.reason).toMatch(/^\d{2} since (start|checkpoint-\d{2})$/);
    expect(readState(TOKEN, tmpDir).wrapup_pending).toBe(0);

    // Second Stop within SKIP_WINDOW after the first wrapup → no emit
    const cap2 = captureStdout();
    handleStop(TOKEN, vaultDir, now + 30, tmpDir);
    const out2 = cap2.stop();
    expect(out2).toBe('');
  });

  it('signal at exactly TTL boundary (24h) is still honored — strict > comparison', () => {
    // Edge case: now - last_ts === WRAPUP_TTL_SECONDS (exactly 24h).
    // Code uses strict `>` so this is NOT stale → checkpoint emits.
    setPending(now - 24 * 60 * 60);
    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, now, tmpDir);
    const out = cap.stop();
    const parsed = JSON.parse(out.trim()) as { reason: string };
    expect(parsed.reason).toMatch(/^\d{2} since (start|checkpoint-\d{2})$/);
  });

  it('regular handleStop (threshold-not-met branch) preserves wrapup_pending', () => {
    // wrapup_pending=1 exists, but Stop's wrapup branch is bypassed by setting
    // last_ts so that `now - last_ts > WRAPUP_TTL_SECONDS` would discard it.
    // Wait — that path clears the flag. To exercise the threshold-not-met
    // branch with wrapup_pending intact, we need pending=1 with FRESH last_ts
    // — but then the wrapup branch fires first and clears.
    //
    // The only way to exercise non-emit branches with pending=1 is impossible
    // by the wrapup branch's design (wrapup priority). Verify instead that
    // when wrapup_pending=0 (normal case), the threshold-not-met branch
    // preserves the existing flag value (which is 0). This rules out an
    // accidental `wrapup_pending: 1` literal sneaking in.
    setPending(now - 200, 0, '00', 2);
    handleStop(TOKEN, vaultDir, now, tmpDir);
    expect(readState(TOKEN, tmpDir).wrapup_pending).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: PostCompact → Stop chain (cross-handler contract)
// ---------------------------------------------------------------------------

describe('end-to-end PostCompact → Stop chain', () => {
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

  it('PostCompact fires → next Stop force-emits checkpoint NN → flag cleared', () => {
    const t0 = 1700000000;

    // Step 1: PostCompact fires (cold start — no prior state).
    handlePostcompact(TOKEN, vaultDir, t0, tmpDir);
    const afterPostcompact = readState(TOKEN, tmpDir);
    expect(afterPostcompact.wrapup_pending).toBe(1);
    expect(afterPostcompact.last_ts).toBe(t0);

    // Step 2: User prompts, assistant responds, Stop hook fires.
    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, t0 + 10, tmpDir);
    const out = cap.stop();

    const parsed = JSON.parse(out.trim()) as { decision: string; reason: string };
    expect(parsed.decision).toBe('block');
    // Uniform NN reason — same shape as activity-driven checkpoints.
    expect(parsed.reason).toMatch(/^\d{2} since (start|checkpoint-\d{2})$/);

    // Step 3: Flag cleared, last_stop_nn updated.
    const afterStop = readState(TOKEN, tmpDir);
    expect(afterStop.wrapup_pending).toBe(0);
    expect(afterStop.last_ts).toBe(t0 + 10);
    expect(afterStop.last_stop_nn).not.toBe('00');
  });

  it('/wrapup runs while wrapup_pending=1 → next Stop does NOT force-emit', () => {
    const t0 = 1700000000;

    // PostCompact set the pending flag.
    handlePostcompact(TOKEN, vaultDir, t0, tmpDir);
    expect(readState(TOKEN, tmpDir).wrapup_pending).toBe(1);

    // User explicitly runs /wrapup → CLI calls `onebrain checkpoint reset`.
    handleReset(TOKEN, t0 + 5, tmpDir);
    expect(readState(TOKEN, tmpDir).wrapup_pending).toBe(0);

    // Subsequent Stop hook firing should NOT force-emit — /wrapup already
    // wrote a session log consolidating prior checkpoints; the post-compact
    // signal is no longer relevant.
    const cap = captureStdout();
    handleStop(TOKEN, vaultDir, t0 + 10, tmpDir);
    const out = cap.stop();
    expect(out).toBe(''); // no emit; SKIP_WINDOW catches the freshly-reset state
  });

  it('/wrapup → /compact within 5 min → PostCompact still sets the flag', () => {
    const t0 = 1700000000;

    // /wrapup wrote a session log and reset state (last_stop_nn='00').
    handleReset(TOKEN, t0, tmpDir);
    expect(readState(TOKEN, tmpDir).last_stop_nn).toBe('00');

    // User does new work, then runs /compact 30s later. The PostCompact
    // recency guard would naively skip (last_ts within 300s) — but the
    // last_stop_nn='00' check means we DON'T skip: there's no Stop
    // checkpoint covering the post-/wrapup conversation, so we must
    // queue an auto-wrapup signal.
    handlePostcompact(TOKEN, vaultDir, t0 + 30, tmpDir);
    const after = readState(TOKEN, tmpDir);
    expect(after.wrapup_pending).toBe(1);
  });

  it('Stop checkpoint → /compact within 5 min → PostCompact recency-skips (no double work)', () => {
    const t0 = 1700000000;

    // Simulate Stop checkpoint emit (last_stop_nn='03', count=0, last_ts=now).
    writeState(TOKEN, { count: 0, last_ts: t0, last_stop_nn: '03', wrapup_pending: 0 }, tmpDir);

    // /compact within 300s → recency guard fires AND last_stop_nn !== '00' →
    // skip. The Stop checkpoint already covers this content; an auto-wrapup
    // would just delete it via Path A.
    handlePostcompact(TOKEN, vaultDir, t0 + 100, tmpDir);
    const after = readState(TOKEN, tmpDir);
    expect(after.wrapup_pending).toBe(0); // unchanged — guard skipped
    expect(after.last_stop_nn).toBe('03'); // preserved
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
    writeState(TOKEN, { count: 3, last_ts: now, last_stop_nn: '02', wrapup_pending: 0 }, tmpDir);

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
