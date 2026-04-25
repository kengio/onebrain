/**
 * checkpoint — internal command
 *
 * Implements stop/precompact/postcompact/reset modes, replacing checkpoint-hook.sh.
 *
 * State file: $TMPDIR/onebrain-{session_token}.state
 * Format: count:last_ts:last_stop_nn[:pending_stub_filename]
 *
 * Note: last_stop_nn is kept for backward compat/debugging only.
 * Checkpoint NN is always derived from actual files on disk — this guarantees
 * sequential numbering even when Claude fails to write a file (e.g. context full).
 *
 * Exit code always 0. Errors go to stderr only.
 * JSON decision blocks go to process.stdout.write (no console.log).
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir as osTmpdir } from 'node:os';
import { join } from 'node:path';
import { loadVaultConfig } from '@onebrain/core';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_WINDOW = 60; // seconds — suppress re-trigger after reset
const MIN_ACTIVITY = 2; // minimum messages to warrant checkpoint
const PRECOMPACT_RECENCY = 300; // seconds — treat checkpoint as "recent" for precompact

// Default thresholds (used when vault.yml is missing/unreadable)
const DEFAULT_MESSAGES_THRESHOLD = 15;
const DEFAULT_MINUTES_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckpointState {
  count: number;
  last_ts: number;
  last_stop_nn: string;
  pending_stub?: string;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function stateFilePath(token: string, tmpDir: string): string {
  return join(tmpDir, `onebrain-${token}.state`);
}

/**
 * Read state from $tmpDir/onebrain-{token}.state.
 * Returns default state if file is missing or malformed (v1 compat: < 3 fields → parse error).
 * Sync — checkpoint hooks must not add async latency.
 */
export function readState(token: string, tmpDir: string = osTmpdir()): CheckpointState {
  const path = stateFilePath(token, tmpDir);
  try {
    const raw = readFileSync(path, 'utf8').trim();
    const parts = raw.split(':');
    // v1 compat: fewer than 3 fields → treat as parse error
    if (parts.length < 3) {
      throw new Error('v1 state format');
    }
    const count = Number(parts[0]);
    const last_ts = Number(parts[1]);
    const last_stop_nn = parts[2] ?? '00';
    const pending_stub = parts[3] && parts[3].length > 0 ? parts[3] : undefined;

    if (!Number.isInteger(count) || !Number.isInteger(last_ts) || !/^\d{2}$/.test(last_stop_nn)) {
      throw new Error('malformed state');
    }

    return { count, last_ts, last_stop_nn, pending_stub };
  } catch {
    // Missing or malformed → fresh state
    // last_ts=0: avoids SKIP_WINDOW on first run (guard requires last_ts > 0)
    // and avoids false "recent checkpoint" in precompact (guard requires last_ts > 0)
    // Eagerly rewrite the state file so v1/malformed files don't accumulate.
    const now = Math.floor(Date.now() / 1000);
    try {
      writeFileSync(stateFilePath(token, tmpDir), `0:${now}:00`, 'utf8');
    } catch (writeErr) {
      process.stderr.write(
        `checkpoint: failed to rewrite state file for token ${token}: ${writeErr}\n`,
      );
    }
    return {
      count: 0,
      last_ts: 0,
      last_stop_nn: '00',
    };
  }
}

/**
 * Write state to $tmpDir/onebrain-{token}.state.
 * 3-field when no pending_stub, 4-field when pending_stub is set.
 * Sync.
 */
export function writeState(
  token: string,
  state: CheckpointState,
  tmpDir: string = osTmpdir(),
): void {
  const path = stateFilePath(token, tmpDir);
  const base = `${state.count}:${state.last_ts}:${state.last_stop_nn}`;
  const content = state.pending_stub !== undefined ? `${base}:${state.pending_stub}` : base;
  try {
    writeFileSync(path, content, 'utf8');
  } catch (err) {
    process.stderr.write(`checkpoint: failed to write state file ${path}: ${err}\n`);
  }
}

// ---------------------------------------------------------------------------
// Config helper
// ---------------------------------------------------------------------------

const DEFAULT_LOGS_FOLDER = '07-logs';

/**
 * Load vault settings from vault.yml (thresholds + logs folder).
 * Returns defaults if vault.yml is missing or throws.
 * Sync via readFileSync + regex parse — avoids async in stop hook hot path.
 */
function loadVaultSettings(vaultRoot: string): {
  messagesThreshold: number;
  minutesThreshold: number;
  logsFolder: string;
} {
  try {
    const vaultYml = join(vaultRoot, 'vault.yml');
    const raw = readFileSync(vaultYml, 'utf8');
    let messages = DEFAULT_MESSAGES_THRESHOLD;
    let minutes = DEFAULT_MINUTES_THRESHOLD;
    let logsFolder = DEFAULT_LOGS_FOLDER;

    const checkpointBlock = raw.match(/^checkpoint:\s*\n((?:[ \t]+[^\n]+\n?)*)/m);
    if (checkpointBlock?.[1]) {
      const block = checkpointBlock[1];
      const msgMatch = block.match(/messages:\s*(\d+)/);
      const minMatch = block.match(/minutes:\s*(\d+)/);
      if (msgMatch?.[1]) messages = Number(msgMatch[1]);
      if (minMatch?.[1]) minutes = Number(minMatch[1]);
    }

    const foldersBlock = raw.match(/^folders:\s*\n((?:[ \t]+[^\n]+\n?)*)/m);
    if (foldersBlock?.[1]) {
      const logsMatch = foldersBlock[1].match(/logs:\s*['"]?([^'"\s]+)['"]?/);
      if (logsMatch?.[1]) logsFolder = logsMatch[1];
    }

    return { messagesThreshold: messages, minutesThreshold: minutes, logsFolder };
  } catch {
    return {
      messagesThreshold: DEFAULT_MESSAGES_THRESHOLD,
      minutesThreshold: DEFAULT_MINUTES_THRESHOLD,
      logsFolder: DEFAULT_LOGS_FOLDER,
    };
  }
}

/**
 * Scan the logs directory and return the highest checkpoint NN for this session.
 * Returns 0 if no checkpoint files exist (i.e. next NN should be 01).
 * Sync — safe to use in handleStop's hot path.
 */
export function maxCheckpointNnSync(
  vaultRoot: string,
  date: string,
  token: string,
  logsFolder: string,
): number {
  const yyyy = date.slice(0, 4);
  const mm = date.slice(5, 7);
  const dir = join(vaultRoot, logsFolder, yyyy, mm);
  const prefix = `${date}-${token}-checkpoint-`;
  try {
    let max = 0;
    for (const f of readdirSync(dir)) {
      if (!f.startsWith(prefix) || !f.endsWith('.md')) continue;
      const m = f.match(/-checkpoint-(\d{2})\.md$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return max;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function formatDate(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const yyyy = d.getFullYear().toString();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatYYYY(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).getFullYear().toString();
}

function formatMM(epochSeconds: number): string {
  return String(new Date(epochSeconds * 1000).getMonth() + 1).padStart(2, '0');
}

// ---------------------------------------------------------------------------
// JSON output helper
// ---------------------------------------------------------------------------

function emitBlock(reason: string): void {
  process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`);
}

// ---------------------------------------------------------------------------
// reset mode
// ---------------------------------------------------------------------------

/**
 * Reset state: write 0:<now>:00 to state file.
 * No stdout. Exit 0 always.
 */
export function handleReset(
  token: string,
  now: number = Math.floor(Date.now() / 1000),
  tmpDir: string = osTmpdir(),
): void {
  writeState(token, { count: 0, last_ts: now, last_stop_nn: '00' }, tmpDir);
}

// ---------------------------------------------------------------------------
// stop mode
// ---------------------------------------------------------------------------

/**
 * Stop hook: increment message count, check thresholds, emit block if needed.
 * Sync — no async/await.
 */
export function handleStop(
  token: string,
  vaultRoot: string,
  now: number = Math.floor(Date.now() / 1000),
  tmpDir: string = osTmpdir(),
): void {
  const state = readState(token, tmpDir);

  // SKIP_WINDOW: if count=0 and last_ts is within 60s, this is right after a /wrapup reset
  if (state.count === 0 && state.last_ts > 0 && now - state.last_ts < SKIP_WINDOW) {
    return; // exit 0, state unchanged
  }

  // Increment count
  state.count += 1;

  const { messagesThreshold, minutesThreshold, logsFolder } = loadVaultSettings(vaultRoot);
  const timeThreshold = minutesThreshold * 60;

  // Elapsed: last_ts=0 is post-compact sentinel → treat as 0 elapsed
  const elapsed = state.last_ts === 0 ? 0 : now - state.last_ts;

  const thresholdMet = state.count >= messagesThreshold || elapsed >= timeThreshold;

  if (!thresholdMet) {
    // Update count but preserve last_ts
    writeState(
      token,
      { count: state.count, last_ts: state.last_ts, last_stop_nn: state.last_stop_nn },
      tmpDir,
    );
    return;
  }

  // MIN_ACTIVITY guard: threshold fired but not enough messages
  if (state.count < MIN_ACTIVITY) {
    // Preserve last_ts so time clock doesn't restart
    writeState(
      token,
      { count: state.count, last_ts: state.last_ts, last_stop_nn: state.last_stop_nn },
      tmpDir,
    );
    return;
  }

  // Derive NN from disk — guarantees sequential numbering even if a previous
  // checkpoint block fired but Claude never wrote the file.
  const date = formatDate(now);
  const maxNn = maxCheckpointNnSync(vaultRoot, date, token, logsFolder);
  const nextNn = String(maxNn + 1).padStart(2, '0');
  const since =
    maxNn === 0 ? ' since start' : ` since checkpoint-${String(maxNn).padStart(2, '0')}`;
  const filename = `${date}-${token}-checkpoint-${nextNn}.md`;
  emitBlock(`${filename}${since}`);

  // Reset state; preserve pending_stub so postcompact can still fill the precompact stub
  writeState(
    token,
    { count: 0, last_ts: now, last_stop_nn: nextNn, pending_stub: state.pending_stub },
    tmpDir,
  );
}

// ---------------------------------------------------------------------------
// precompact mode
// ---------------------------------------------------------------------------

const PRECOMPACT_STUB_TEMPLATE = (date: string, nn: string): string => `---
tags: [checkpoint, session-log]
date: ${date}
checkpoint: ${nn}
trigger: precompact
merged: false
---

## What We Worked On

<!-- stub: written automatically before compact — fill in via postcompact -->

## Key Decisions

-

## Insights & Learnings

-

## What Worked / Didn't Work

-

## Action Items

-

## Open Questions

-
`;

/**
 * Precompact hook: ensure a checkpoint exists before compact.
 * If a checkpoint was written within the last 5 minutes, let compact proceed (no-op).
 * Otherwise write a stub file and update state to 4-field.
 * Async (file writes).
 */
export async function handlePrecompact(
  token: string,
  vaultRoot: string,
  now: number = Math.floor(Date.now() / 1000),
  tmpDir: string = osTmpdir(),
): Promise<void> {
  const state = readState(token, tmpDir);

  // Recency check: if last checkpoint < 5 minutes ago, let compact proceed
  if (state.last_ts > 0 && now - state.last_ts < PRECOMPACT_RECENCY) {
    return; // no-op
  }

  // Double-compact guard: if a stub is already pending postcompact will fill it
  if (state.pending_stub) {
    return; // no-op — prevents orphaning the existing stub
  }

  const date = formatDate(now);

  // Determine logs folder from vault.yml (fallback to '07-logs')
  let logsFolder = DEFAULT_LOGS_FOLDER;
  try {
    const config = await loadVaultConfig(vaultRoot);
    logsFolder = config.folders.logs;
  } catch {
    // use default
  }

  const yyyy = formatYYYY(now);
  const mm = formatMM(now);
  const stubDir = join(vaultRoot, logsFolder, yyyy, mm);

  // Derive stub NN from disk — same guarantee as handleStop: sequential, no gaps
  const existingFiles = await readdir(stubDir).catch(() => [] as string[]);
  const prefix = `${date}-${token}-checkpoint-`;
  const maxNn = existingFiles.reduce((max, f) => {
    if (!f.startsWith(prefix) || !f.endsWith('.md')) return max;
    const m = f.match(/-checkpoint-(\d{2})\.md$/);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  const stubNn = String(maxNn + 1).padStart(2, '0');

  const stubFilename = `${date}-${token}-checkpoint-${stubNn}.md`;
  const stubPath = join(stubDir, stubFilename);

  try {
    await mkdir(stubDir, { recursive: true });
    await writeFile(stubPath, PRECOMPACT_STUB_TEMPLATE(date, stubNn), 'utf8');
  } catch (err) {
    process.stderr.write(`checkpoint: failed to write stub file ${stubPath}: ${err}\n`);
    return;
  }

  // Update state: count=0, last_ts UNCHANGED, last_stop_nn UNCHANGED, pending_stub set
  writeState(
    token,
    {
      count: 0,
      last_ts: state.last_ts,
      last_stop_nn: state.last_stop_nn,
      pending_stub: stubFilename,
    },
    tmpDir,
  );
}

// ---------------------------------------------------------------------------
// postcompact mode
// ---------------------------------------------------------------------------

/**
 * Postcompact hook: handle pending stub from precompact.
 * If pending stub: emit fill-checkpoint block, set last_ts=now.
 * Predecessor NN derived from disk scan — correct even when there are gaps.
 * Sync. Called only when state has pending_stub set.
 */
export function handlePostcompact(
  token: string,
  vaultRoot: string,
  now: number = Math.floor(Date.now() / 1000),
  tmpDir: string = osTmpdir(),
): void {
  const state = readState(token, tmpDir);

  if (!state.pending_stub) {
    writeState(
      token,
      { count: 0, last_ts: state.last_ts, last_stop_nn: state.last_stop_nn },
      tmpDir,
    );
    return;
  }

  const stubNnMatch = state.pending_stub.match(/-checkpoint-(\d{2})\.md$/);
  const stubNn = stubNnMatch?.[1] ?? '01';
  const stubNnNum = Number(stubNn);

  // Derive predecessor from disk — correct even when there are gaps in numbering
  const { logsFolder } = loadVaultSettings(vaultRoot);
  const date = state.pending_stub.slice(0, 10); // YYYY-MM-DD prefix
  const yyyy = date.slice(0, 4);
  const mm = date.slice(5, 7);
  const dir = join(vaultRoot, logsFolder, yyyy, mm);
  const prefix = `${date}-${token}-checkpoint-`;
  let predecessorNn = 0;
  try {
    for (const f of readdirSync(dir)) {
      if (!f.startsWith(prefix) || !f.endsWith('.md')) continue;
      const m = f.match(/-checkpoint-(\d{2})\.md$/);
      if (m) {
        const nn = Number(m[1]);
        if (nn < stubNnNum) predecessorNn = Math.max(predecessorNn, nn);
      }
    }
  } catch {
    // dir missing or unreadable — predecessorNn stays 0 → 'since start'
  }

  const since =
    predecessorNn === 0
      ? ' since start'
      : ` since checkpoint-${String(predecessorNn).padStart(2, '0')}`;
  emitBlock(`fill-checkpoint: ${state.pending_stub}${since}`);

  // last_ts=now: recency guard in handlePrecompact blocks re-fire within 5 min
  writeState(token, { count: 0, last_ts: now, last_stop_nn: stubNn }, tmpDir);
}

// ---------------------------------------------------------------------------
// postcompact fallback
// ---------------------------------------------------------------------------

/**
 * Postcompact entry point: reads state once and dispatches to the correct path.
 * - pending_stub present → delegates to handlePostcompact (fills known stub)
 * - pending_stub absent  → scans disk for unmerged precompact stubs (state lost/expired)
 *
 * Single state read here; handlePostcompact also reads state internally (benign
 * double-read — postcompact is never called concurrently).
 * Sync.
 */
export function postcompactFallback(
  token: string,
  vaultRoot: string,
  now: number = Math.floor(Date.now() / 1000),
  tmpDir: string = osTmpdir(),
): void {
  const state = readState(token, tmpDir);

  if (state.pending_stub) {
    handlePostcompact(token, vaultRoot, now, tmpDir);
    return;
  }

  // No pending_stub — scan disk for unmerged precompact stubs for this session today.
  const { logsFolder } = loadVaultSettings(vaultRoot);
  const date = formatDate(now);
  const yyyy = date.slice(0, 4);
  const mm = date.slice(5, 7);
  const dir = join(vaultRoot, logsFolder, yyyy, mm);
  const prefix = `${date}-${token}-checkpoint-`;

  const stubs: string[] = [];
  const allNns: number[] = [];
  try {
    for (const f of readdirSync(dir)) {
      if (!f.startsWith(prefix) || !f.endsWith('.md')) continue;
      const m = f.match(/-checkpoint-(\d{2})\.md$/);
      if (!m) continue;
      allNns.push(Number(m[1]));
      const content = readFileSync(join(dir, f), 'utf8');
      if (/^trigger:\s*precompact/m.test(content) && !/^merged:\s*true/m.test(content)) {
        stubs.push(f);
      }
    }
  } catch {
    // dir missing or unreadable — fall through to clean state write
  }

  if (stubs.length === 0) {
    writeState(
      token,
      { count: 0, last_ts: state.last_ts, last_stop_nn: state.last_stop_nn },
      tmpDir,
    );
    return;
  }

  stubs.sort();
  const stubFilename = stubs[stubs.length - 1];
  const stubNnMatch = stubFilename.match(/-checkpoint-(\d{2})\.md$/);
  const stubNn = stubNnMatch?.[1] ?? '01';
  const stubNnNum = Number(stubNn);
  // Derive predecessor from disk — correct even when there are gaps in numbering
  const predecessorNn = allNns.filter((n) => n < stubNnNum).reduce((max, n) => Math.max(max, n), 0);
  const since =
    predecessorNn === 0
      ? ' since start'
      : ` since checkpoint-${String(predecessorNn).padStart(2, '0')}`;
  emitBlock(`fill-checkpoint: ${stubFilename}${since}`);
  writeState(token, { count: 0, last_ts: now, last_stop_nn: stubNn }, tmpDir);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Dispatch to the correct mode handler.
 * Always exits 0 (errors to stderr only).
 */
export async function checkpointCommand(
  mode: string,
  token: string,
  vaultRoot: string,
): Promise<void> {
  try {
    switch (mode) {
      case 'stop':
        handleStop(token, vaultRoot);
        break;
      case 'precompact':
        await handlePrecompact(token, vaultRoot);
        break;
      case 'postcompact':
        postcompactFallback(token, vaultRoot);
        break;
      case 'reset':
        handleReset(token);
        break;
      default:
        process.stderr.write(`checkpoint: unknown mode '${mode}'\n`);
    }
  } catch (err) {
    process.stderr.write(`checkpoint: unexpected error in ${mode} mode: ${err}\n`);
  }
}
