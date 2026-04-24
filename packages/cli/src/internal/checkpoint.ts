/**
 * checkpoint — internal command
 *
 * Implements stop/precompact/postcompact/reset modes, replacing checkpoint-hook.sh.
 *
 * State file: $TMPDIR/onebrain-{session_token}.state
 * Format: count:last_ts:last_stop_nn[:pending_stub_filename]
 *
 * Exit code always 0. Errors go to stderr only.
 * JSON decision blocks go to process.stdout.write (no console.log).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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

/**
 * Load messages and minutes thresholds from vault.yml.
 * Returns defaults if vault.yml is missing or throws.
 * Sync via readFileSync + yaml inline parse — avoids async in hot path.
 */
function loadThresholds(vaultRoot: string): {
	messagesThreshold: number;
	minutesThreshold: number;
} {
	try {
		const vaultYml = join(vaultRoot, 'vault.yml');
		const raw = readFileSync(vaultYml, 'utf8');
		// Simple regex extraction — avoids async yaml parse
		const messagesMatch = raw.match(/^checkpoint:\s*\n(?:[^\n]*\n)*?\s+messages:\s*(\d+)/m);
		const minutesMatch = raw.match(/^checkpoint:\s*\n(?:[^\n]*\n)*?\s+minutes:\s*(\d+)/m);

		// More robust: find checkpoint block then parse keys within it
		const checkpointBlock = raw.match(/^checkpoint:\s*\n((?:[ \t]+[^\n]+\n?)*)/m);
		let messages = DEFAULT_MESSAGES_THRESHOLD;
		let minutes = DEFAULT_MINUTES_THRESHOLD;
		if (checkpointBlock?.[1]) {
			const block = checkpointBlock[1];
			const msgMatch = block.match(/messages:\s*(\d+)/);
			const minMatch = block.match(/minutes:\s*(\d+)/);
			if (msgMatch?.[1]) messages = Number(msgMatch[1]);
			if (minMatch?.[1]) minutes = Number(minMatch[1]);
		} else {
			// Try flat matches as fallback
			if (messagesMatch?.[1]) messages = Number(messagesMatch[1]);
			if (minutesMatch?.[1]) minutes = Number(minutesMatch[1]);
		}

		return { messagesThreshold: messages, minutesThreshold: minutes };
	} catch {
		return {
			messagesThreshold: DEFAULT_MESSAGES_THRESHOLD,
			minutesThreshold: DEFAULT_MINUTES_THRESHOLD,
		};
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

	const { messagesThreshold, minutesThreshold } = loadThresholds(vaultRoot);
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

	// Emit checkpoint
	const nextNn = String(Number(state.last_stop_nn) + 1).padStart(2, '0');
	const date = formatDate(now);
	const filename = `${date}-${token}-checkpoint-${nextNn}.md`;
	const since =
		state.last_stop_nn === '00' ? ' since start' : ` since checkpoint-${state.last_stop_nn}`;
	emitBlock(`${filename}${since}`);

	// Reset state
	writeState(token, { count: 0, last_ts: now, last_stop_nn: nextNn }, tmpDir);
}

// ---------------------------------------------------------------------------
// precompact mode
// ---------------------------------------------------------------------------

const PRECOMPACT_STUB_TEMPLATE = (date: string, nn: string): string => `---
tags: [checkpoint, session-log]
date: ${date}
checkpoint: ${Number(nn)}
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

	// Compute stub NN (last_stop_nn + 1, does NOT update last_stop_nn in state)
	const stubNn = String(Number(state.last_stop_nn) + 1).padStart(2, '0');
	const date = formatDate(now);
	const stubFilename = `${date}-${token}-checkpoint-${stubNn}.md`;

	// Determine logs folder from vault.yml (fallback to '07-logs')
	let logsFolder = '07-logs';
	try {
		const config = await loadVaultConfig(vaultRoot);
		logsFolder = config.folders.logs;
	} catch {
		// use default
	}

	const yyyy = formatYYYY(now);
	const mm = formatMM(now);
	const stubDir = join(vaultRoot, logsFolder, yyyy, mm);
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
 * If no pending stub: preserve last_ts, write clean 3-field state.
 * If pending stub: emit fill-checkpoint block, clear pending_stub, set last_ts=0.
 * Sync.
 */
export function handlePostcompact(
	token: string,
	_now: number = Math.floor(Date.now() / 1000),
	tmpDir: string = osTmpdir(),
): void {
	const state = readState(token, tmpDir);

	if (!state.pending_stub) {
		// No pending stub — preserve last_ts, write 3-field
		writeState(
			token,
			{ count: 0, last_ts: state.last_ts, last_stop_nn: state.last_stop_nn },
			tmpDir,
		);
		return;
	}

	// Pending stub found — emit fill-checkpoint block
	const since =
		state.last_stop_nn === '00' ? ' since start' : ` since checkpoint-${state.last_stop_nn}`;
	emitBlock(`fill-checkpoint: ${state.pending_stub}${since}`);

	// Clear pending_stub, set last_ts=0 sentinel
	writeState(token, { count: 0, last_ts: 0, last_stop_nn: state.last_stop_nn }, tmpDir);
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
				handlePostcompact(token);
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
