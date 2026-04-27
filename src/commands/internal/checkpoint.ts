/**
 * checkpoint — internal command
 *
 * Implements stop/postcompact/reset modes.
 *
 * State file: $TMPDIR/onebrain-{session_token}.state
 * Format: count:last_ts:last_stop_nn
 *
 * Note: last_stop_nn is kept for backward compat/debugging only.
 * Checkpoint NN is always derived from actual files on disk — this guarantees
 * sequential numbering even when Claude fails to write a file (e.g. context full).
 *
 * Exit code always 0. Errors go to stderr only.
 * JSON decision blocks go to process.stdout.write (no console.log).
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir as osTmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_WINDOW = 60; // seconds — suppress re-trigger after reset
const MIN_ACTIVITY = 2; // minimum messages to warrant checkpoint
const PRECOMPACT_RECENCY = 300; // seconds — postcompact recency guard

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
 * 4-field state (legacy pending_stub) is accepted — the 4th field is silently ignored.
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
    // parts[3] (legacy pending_stub) silently ignored

    if (!Number.isInteger(count) || !Number.isInteger(last_ts) || !/^\d{2}$/.test(last_stop_nn)) {
      throw new Error('malformed state');
    }

    return { count, last_ts, last_stop_nn };
  } catch {
    // Missing or malformed → fresh state
    // last_ts=0: avoids SKIP_WINDOW on first run (guard requires last_ts > 0)
    // and avoids false "recent checkpoint" in postcompact recency guard (requires last_ts > 0)
    // Eagerly rewrite the state file so v1/malformed files don't accumulate.
    // Use last_ts=0 to match the returned value — callers rely on last_ts=0 to
    // disable SKIP_WINDOW and recency guards on the first run.
    try {
      writeFileSync(stateFilePath(token, tmpDir), '0:0:00', 'utf8');
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
 * Write state to $tmpDir/onebrain-{token}.state (3-field format).
 * Sync.
 */
export function writeState(
  token: string,
  state: CheckpointState,
  tmpDir: string = osTmpdir(),
): void {
  const path = stateFilePath(token, tmpDir);
  const content = `${state.count}:${state.last_ts}:${state.last_stop_nn}`;
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
  emitBlock(`${nextNn}${since}`);

  writeState(token, { count: 0, last_ts: now, last_stop_nn: nextNn }, tmpDir);
}

// ---------------------------------------------------------------------------
// postcompact mode
// ---------------------------------------------------------------------------

/**
 * Postcompact hook: emit auto-wrapup block so Claude synthesizes the session.
 * If the last checkpoint was very recent (compact followed a stop), skip to avoid
 * double-wrapup — the stop checkpoint is already complete.
 */
export function handlePostcompact(
  token: string,
  _vaultRoot: string,
  now: number = Math.floor(Date.now() / 1000),
  tmpDir: string = osTmpdir(),
): void {
  const state = readState(token, tmpDir);

  // Recency guard: stop checkpoint written within 5 min → compact followed stop → skip
  if (state.last_ts > 0 && now - state.last_ts < PRECOMPACT_RECENCY) {
    writeState(
      token,
      { count: 0, last_ts: state.last_ts, last_stop_nn: state.last_stop_nn },
      tmpDir,
    );
    return;
  }

  emitBlock('auto-wrapup');
  writeState(token, { count: 0, last_ts: now, last_stop_nn: state.last_stop_nn }, tmpDir);
}

// ---------------------------------------------------------------------------
// postcompact entry point
// ---------------------------------------------------------------------------

/**
 * Postcompact entry point: delegates to handlePostcompact.
 * Kept as a separate export for backward compat with existing test imports.
 */
export function postcompactFallback(
  token: string,
  vaultRoot: string,
  now: number = Math.floor(Date.now() / 1000),
  tmpDir: string = osTmpdir(),
): void {
  handlePostcompact(token, vaultRoot, now, tmpDir);
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
