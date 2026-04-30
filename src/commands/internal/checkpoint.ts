/**
 * checkpoint — internal command
 *
 * Implements stop/postcompact/reset modes. The Stop hook is the SOLE producer
 * of checkpoint signals; session logs are produced only by /wrapup (manual) or
 * AUTO-SUMMARY (end-of-session signal). This keeps "1 session = 1 session log"
 * as the user-facing invariant.
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
 * - Stop: emits {decision:"block",reason:"NN since <context>"} — always. The
 *   reason is uniform whether the checkpoint was triggered by message count,
 *   time threshold, or PostCompact follow-up. The agent treats all three the
 *   same: write a checkpoint file capturing the conversation since the last NN.
 * - PostCompact: sets `wrapup_pending=1` in the shared state file (its stdout
 *   cannot reach the agent because PostCompact is observational-only). The
 *   flag forces the next Stop to emit a checkpoint NN regardless of count /
 *   threshold / SKIP_WINDOW — PostCompact's intent is "capture the compacted
 *   summary into a checkpoint file before more conversation happens".
 *
 * Session log creation lives outside this file — see /wrapup skill and
 * AUTO-SUMMARY in INSTRUCTIONS.md. Both consolidate accumulated checkpoint
 * files into one session log per call.
 *
 * Concurrency: each hook runs as its own short-lived CLI subprocess. State writes use
 * atomic write-then-rename (pid-suffixed temp file → POSIX rename) so concurrent writers
 * cannot tear the file.
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
   * 0 = no post-compact follow-up pending.
   * 1 = PostCompact fired and is waiting for the next Stop hook to force
   *     a checkpoint emission (capturing the compacted summary in a checkpoint
   *     file). Cleared after emission, or silently cleared if the signal
   *     exceeds WRAPUP_TTL_SECONDS.
   *
   * The field name `wrapup_pending` is historical — earlier iterations of this
   * design produced a session log directly, hence "wrapup". The behavior is
   * now "force-checkpoint" but the field name is preserved for state-file
   * stability.
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
    // Missing or malformed → fresh state, eagerly rewritten so subsequent reads
    // short-circuit cleanly. Filesystem corruption that destroys a pending flag
    // is exceedingly rare; if it happens, the worst outcome is a missed
    // auto-wrapup, which /wrapup orphan recovery will pick up at next session.
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
 * write-then-rename. The pid-suffixed temp file + POSIX rename mirrors the
 * pattern used by `register-hooks.ts:writeSettings` and prevents torn reads
 * if a writer is interrupted mid-write.
 *
 * Sync. Errors logged to stderr.
 */
export function writeState(
  token: string,
  state: CheckpointState,
  tmpDir: string = osTmpdir(),
): void {
  const path = stateFilePath(token, tmpDir);
  const tmpPath = `${path}.tmp.${process.pid}`;
  const content = `${state.count}:${state.last_ts}:${state.last_stop_nn}:${state.wrapup_pending}`;
  try {
    writeFileSync(tmpPath, content, 'utf8');
    renameSync(tmpPath, path);
  } catch (err) {
    process.stderr.write(`checkpoint: failed to write state file ${path}: ${err}\n`);
    // Best-effort cleanup of temp file if write succeeded but rename failed.
    try {
      unlinkSync(tmpPath);
    } catch {
      // ignore
    }
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

  // Post-compact priority: PostCompact set wrapup_pending=1; force a checkpoint
  // emission on this Stop regardless of count / threshold / SKIP_WINDOW /
  // MIN_ACTIVITY. PostCompact's intent is "the compacted summary needs to land
  // in a checkpoint file before more conversation accumulates" — without this
  // forced emission the agent might wait until the regular threshold and lose
  // freshness in the meantime.
  //
  // The emitted reason is uniform with regular checkpoint emissions
  // (`NN since <context>`) — the agent treats post-compact checkpoints the
  // same as activity-driven ones. Session log creation is deferred to /wrapup
  // (manual) or AUTO-SUMMARY (end-of-session), preserving the
  // "1 session = 1 session log" invariant.
  if (state.wrapup_pending === 1) {
    if (state.last_ts > 0 && now - state.last_ts > WRAPUP_TTL_SECONDS) {
      // Stale signal from a forgotten session that reused this token —
      // discard silently rather than capture a checkpoint with stale context.
      writeState(token, { ...state, wrapup_pending: 0 }, tmpDir);
      return;
    }
    const { logsFolder } = loadVaultSettings(vaultRoot);
    const date = formatDate(now);
    const maxNn = maxCheckpointNnSync(vaultRoot, date, token, logsFolder);
    const nextNn = String(maxNn + 1).padStart(2, '0');
    const since =
      maxNn === 0 ? ' since start' : ` since checkpoint-${String(maxNn).padStart(2, '0')}`;
    emitBlock(`${nextNn}${since}`);
    writeState(token, { count: 0, last_ts: now, last_stop_nn: nextNn, wrapup_pending: 0 }, tmpDir);
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

  // Stop's regular branches never modify wrapup_pending — it's owned by
  // PostCompact (set) and the wrapup branch above / handleReset (clear).
  // Spread the original state so the flag survives across all writeState
  // branches below (threshold-not-met, MIN_ACTIVITY guard, threshold-met emit).

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
 * next Stop hook firing emits `decision:"block",reason:"auto-wrapup"` to the
 * agent (PostCompact stdout cannot reach the agent — see file header).
 *
 * Recency guard: if a Stop checkpoint was just written within the last 5 min
 * (last_ts recent AND last_stop_nn !== '00'), skip — that checkpoint already
 * covers the conversation and a follow-up auto-wrapup would just delete it
 * via Path A. The `last_stop_nn !== '00'` check is critical because after
 * `/wrapup` the state has last_stop_nn='00' with a fresh last_ts; without
 * the check, an immediate `/compact` would be silently skipped and any
 * conversation between /wrapup and /compact would be lost.
 *
 * In-session double-/compact: if `wrapup_pending` is already 1 from a prior
 * PostCompact, both branches of this function preserve it — the recency guard
 * leaves the file untouched on skip, and the main path overwrites with `1`
 * anyway. Cross-session staleness is handled by the 24h TTL guard in handleStop.
 *
 * The wrapup signal lives inside the same atomic state write — there is no
 * separate marker file. A single write either persists both the recency
 * timestamp AND the pending flag, or fails (logged to stderr; on-disk state
 * unchanged so the next compact attempts again).
 */
export function handlePostcompact(
  token: string,
  _vaultRoot: string,
  now: number = Math.floor(Date.now() / 1000),
  tmpDir: string = osTmpdir(),
): void {
  const state = readState(token, tmpDir);

  // Recency guard: skip only when the recent activity was a Stop hook
  // checkpoint (last_stop_nn !== '00'), because that checkpoint already
  // covers the conversation and a follow-up auto-wrapup would just delete
  // the checkpoint via Path A.
  //
  // Critical exception: after `/wrapup` runs handleReset, last_stop_nn is
  // '00' and last_ts is recent. If `/compact` follows within 300s, the
  // recency guard would skip and any conversation between /wrapup and
  // /compact would have NO recovery path (no checkpoint written, no
  // wrapup_pending set, just compacted context). last_stop_nn === '00'
  // distinguishes that case → fall through and set the flag.
  //
  // In-session double-/compact: if wrapup_pending is already 1, the recency
  // guard is irrelevant — we don't need to set it again, just preserve.
  // Cross-session staleness is handled by the 24h TTL guard in handleStop.
  if (
    state.last_ts > 0 &&
    now - state.last_ts < PRECOMPACT_RECENCY &&
    state.last_stop_nn !== '00'
  ) {
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
