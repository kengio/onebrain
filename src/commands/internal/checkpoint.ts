/**
 * checkpoint — internal command
 *
 * Implements stop/postcompact/reset modes. Two block-reason flavors are emitted
 * from the Stop hook: `NN since <context>` for regular checkpoints, and
 * `auto-wrapup` for the PostCompact follow-up signal. Both reach the agent via
 * the same Stop hook → no separate UserPromptSubmit hook is required.
 *
 * State file: $TMPDIR/onebrain-{session_token}.state
 * Format:     count:last_ts:last_stop_nn:wrapup_pending
 *
 * - count          number of Stop messages since the last checkpoint emission
 * - last_ts        unix seconds of the most recent state-touching event
 * - last_stop_nn   bookkeeping for the most recent checkpoint NN written (debug only)
 * - wrapup_pending 0 or 1 — set by PostCompact, consumed by the next Stop hook
 *
 * Checkpoint NN is always derived from actual files on disk — this guarantees
 * sequential numbering even when Claude fails to write a file (e.g. context full).
 *
 * Hook signal delivery:
 * - Stop: emits {decision:"block",reason:"NN since ..."} for checkpoints, or
 *   {decision:"block",reason:"auto-wrapup"} when wrapup_pending=1. Wrapup takes
 *   priority — it bypasses SKIP_WINDOW and the message-count threshold because
 *   PostCompact intends the very next Stop to deliver the signal.
 * - PostCompact: sets `wrapup_pending=1` in the shared state file (its stdout
 *   cannot reach the agent because PostCompact is observational-only). The
 *   signal is consumed by the next Stop hook firing.
 *
 * Concurrency: each hook runs as its own short-lived CLI subprocess. State writes use
 * atomic write-then-rename (pid-suffixed temp file → POSIX rename) so concurrent writers
 * cannot tear the file. Read-modify-write races (one hook reading old state while another
 * is writing) are theoretically possible but practically rare — Claude Code hooks fire
 * sequentially per session.
 *
 * Exit code always 0. Errors go to stderr only.
 * JSON decision blocks go to process.stdout.write (no console.log).
 */

import { readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir as osTmpdir } from 'node:os';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKIP_WINDOW = 60; // seconds — suppress re-trigger after reset
const MIN_ACTIVITY = 2; // minimum messages to warrant checkpoint
const PRECOMPACT_RECENCY = 300; // seconds — postcompact recency guard
const WRAPUP_TTL_SECONDS = 24 * 60 * 60; // pending wrapup older than this is stale

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
  /**
   * 0 = no auto-wrapup pending.
   * 1 = PostCompact fired and is waiting for the next Stop hook to emit
   *     `decision:"block",reason:"auto-wrapup"` to the agent. Cleared after
   *     emission (or silently cleared if the signal exceeds WRAPUP_TTL_SECONDS).
   */
  wrapup_pending: 0 | 1;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

function stateFilePath(token: string, tmpDir: string): string {
  return join(tmpDir, `onebrain-${token}.state`);
}

const FRESH_STATE_DISK = '0:0:00:0';

/**
 * Read state from $tmpDir/onebrain-{token}.state.
 * Returns default state if file is missing or malformed.
 *
 * Backward-compat: a 3-field legacy file (`count:last_ts:last_stop_nn`) parses
 * with `wrapup_pending = 0`. A 4-field file from prior versions (which carried
 * a `pending_stub` filename string in slot 4) parses by interpreting any
 * non-`1` value as `wrapup_pending = 0` — the legacy field never had `1` as a
 * valid value, so this is unambiguous.
 *
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
    // parts[3]: '1' = wrapup pending; anything else (missing, '0', legacy filename) = not pending
    const wrapup_pending: 0 | 1 = parts[3] === '1' ? 1 : 0;

    if (!Number.isInteger(count) || !Number.isInteger(last_ts) || !/^\d{2}$/.test(last_stop_nn)) {
      throw new Error('malformed state');
    }

    return { count, last_ts, last_stop_nn, wrapup_pending };
  } catch {
    // Missing or malformed → fresh state
    // last_ts=0: avoids SKIP_WINDOW on first run (guard requires last_ts > 0)
    // and avoids false "recent checkpoint" in postcompact recency guard (requires last_ts > 0)
    // Eagerly rewrite the state file so v1/malformed files don't accumulate.
    // Use last_ts=0 to match the returned value — callers rely on last_ts=0 to
    // disable SKIP_WINDOW and recency guards on the first run.
    try {
      writeFileSync(stateFilePath(token, tmpDir), FRESH_STATE_DISK, 'utf8');
    } catch (writeErr) {
      process.stderr.write(
        `checkpoint: failed to rewrite state file for token ${token}: ${writeErr}\n`,
      );
    }
    return {
      count: 0,
      last_ts: 0,
      last_stop_nn: '00',
      wrapup_pending: 0,
    };
  }
}

/**
 * Write state to $tmpDir/onebrain-{token}.state (4-field format) via atomic
 * write-then-rename. Eliminates torn writes if Stop and PostCompact hook
 * processes happen to overlap (rare — hooks fire sequentially in normal
 * Claude Code usage, but defensive anyway).
 *
 * Each hook process uses a pid-suffixed temp file so two concurrent writers
 * don't clobber each other's temp files. The final rename is atomic on POSIX.
 *
 * Returns true on success, false on filesystem failure.
 *
 * Callers that set `wrapup_pending=1` (PostCompact) must check the return value
 * before advancing other guards — a silent write failure followed by the
 * recency guard kicking in would permanently lose the session log.
 *
 * Sync.
 */
export function writeState(
  token: string,
  state: CheckpointState,
  tmpDir: string = osTmpdir(),
): boolean {
  const path = stateFilePath(token, tmpDir);
  const tmpPath = `${path}.tmp.${process.pid}`;
  const content = `${state.count}:${state.last_ts}:${state.last_stop_nn}:${state.wrapup_pending}`;
  try {
    writeFileSync(tmpPath, content, 'utf8');
    renameSync(tmpPath, path);
    return true;
  } catch (err) {
    process.stderr.write(`checkpoint: failed to write state file ${path}: ${err}\n`);
    // Best-effort cleanup of temp file if rename failed (write succeeded).
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore
    }
    return false;
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
 * Reset state: write 0:<now>:00:0 to state file.
 *
 * Called by the agent after a session log is written (either via /wrapup or
 * via the PostCompact background sub-agent). Clears count, last_stop_nn, and
 * wrapup_pending in one shot so the next checkpoint cycle starts from scratch.
 *
 * No stdout. Exit 0 always.
 */
export function handleReset(
  token: string,
  now: number = Math.floor(Date.now() / 1000),
  tmpDir: string = osTmpdir(),
): void {
  writeState(token, { count: 0, last_ts: now, last_stop_nn: '00', wrapup_pending: 0 }, tmpDir);
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

  // Wrapup priority: PostCompact set wrapup_pending=1; the very next Stop must
  // deliver the auto-wrapup signal. This bypasses SKIP_WINDOW and the regular
  // checkpoint-threshold logic — wrapup replaces the would-be checkpoint
  // because the session log it produces covers the same ground.
  if (state.wrapup_pending === 1) {
    if (state.last_ts > 0 && now - state.last_ts > WRAPUP_TTL_SECONDS) {
      // Stale signal from a forgotten session that reused this token →
      // discard silently rather than inject confusing context.
      process.stderr.write(`checkpoint: discarding stale auto-wrapup signal for token ${token}\n`);
      writeState(token, { ...state, wrapup_pending: 0 }, tmpDir);
      return;
    }
    emitBlock('auto-wrapup');
    writeState(
      token,
      { count: 0, last_ts: now, last_stop_nn: state.last_stop_nn, wrapup_pending: 0 },
      tmpDir,
    );
    return;
  }

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

  // Stop never modifies wrapup_pending — it's owned by PostCompact (set) and
  // UserPromptSubmit/handleReset (clear). Spread the original state so the flag
  // survives across all writeState branches below.

  if (!thresholdMet) {
    // Update count but preserve last_ts
    writeState(token, { ...state }, tmpDir);
    return;
  }

  // MIN_ACTIVITY guard: threshold fired but not enough messages
  if (state.count < MIN_ACTIVITY) {
    // Preserve last_ts so time clock doesn't restart
    writeState(token, { ...state }, tmpDir);
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

  writeState(
    token,
    { count: 0, last_ts: now, last_stop_nn: nextNn, wrapup_pending: state.wrapup_pending },
    tmpDir,
  );
}

// ---------------------------------------------------------------------------
// postcompact mode
// ---------------------------------------------------------------------------

/**
 * Postcompact hook: set `wrapup_pending=1` in the shared state file so the
 * next UserPromptSubmit delivers the signal to Claude (PostCompact stdout
 * cannot reach the agent — see file header).
 *
 * If the last checkpoint was very recent (compact followed a stop), skip to
 * avoid double-wrapup — the stop checkpoint is already complete. In that case
 * also clear any pre-existing wrapup_pending so a later session reusing this
 * token (cache hit) doesn't consume a stale directive.
 *
 * The wrapup signal lives inside the same atomic state write — there is no
 * separate marker file. A single write either persists both the recency
 * timestamp AND the pending flag, or fails silently and leaves both unchanged.
 */
export function handlePostcompact(
  token: string,
  _vaultRoot: string,
  now: number = Math.floor(Date.now() / 1000),
  tmpDir: string = osTmpdir(),
): void {
  const state = readState(token, tmpDir);

  // Recency guard: a recent state-touching event (Stop checkpoint OR a prior
  // PostCompact in the same session) means we should not add a new wrap-up
  // obligation. Preserve existing state on disk — in particular, do NOT clear
  // wrapup_pending: if a prior PostCompact in the same session already set it,
  // that signal must survive until UserPromptSubmit consumes it.
  //
  // Cross-session staleness (an old flag from a closed session whose token got
  // reused) is handled by the 24h TTL guard in handleUserPromptSubmit, not here.
  if (state.last_ts > 0 && now - state.last_ts < PRECOMPACT_RECENCY) {
    return;
  }

  // writeState returns false on filesystem failure. We deliberately do not
  // advance any in-memory state separately — failure to persist the flag
  // means the session is reported lost via stderr, not silently swallowed.
  writeState(
    token,
    {
      count: 0,
      last_ts: now,
      last_stop_nn: state.last_stop_nn,
      wrapup_pending: 1,
    },
    tmpDir,
  );
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
