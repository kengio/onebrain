# Session Identity System Design
**Date:** 2026-04-18
**Branch:** feature/wrapup-orphan-recovery (PR #85)
**Status:** Approved

## Problem

OneBrain checkpoints use `session_token` to identify which checkpoints belong to which session. The previous design generated a random 6-char token at startup and stored it in context — but this approach had problems:

- Token lost after compact (unreliable recovery)
- Multi-session ambiguity: multiple Claude Code windows on same day couldn't be distinguished
- Required `.sessions/` folder in vault for persistence
- Stale session file cleanup overhead

## Solution: PPID as Session Token

Use the process parent ID (`$PPID`) as the session token. Both the hook script and the LLM's Bash subprocess are children of the same Claude Code process, so they share the same PPID — guaranteed unique per Claude Code instance, always available, no storage required.

```
session_token = $PPID   (e.g. 64791)
checkpoint filename: YYYY-MM-DD-64791-checkpoint-01.md
```

## Design

### Session Token

- `session_token = $PPID` — available via `echo $PPID` in any Bash call
- Never lost after compact: `$PPID` is always accurate from the OS
- Multi-session isolation: each Claude Code window has a different PPID → different token → no collision
- No `# Summary instructions` needed — PPID recovery is always exact

### Checkpoint Numbering

Next checkpoint number is determined by globbing existing files:

```bash
EXISTING=$(ls "${CHECKPOINT_DIR}/${TODAY_DATE}-${PPID}-checkpoint-"*.md 2>/dev/null | wc -l | tr -d ' ')
NN=$(printf "%02d" $(( EXISTING + 1 )))
```

- Always starts at `01` if no files exist
- Accurate after compact (filesystem is source of truth)
- No counter storage required

### Hook Script Changes (checkpoint-hook.sh)

Remove `.sessions/` lookup, replace with PPID:

```bash
# Remove: SESSIONS_DIR, TOKEN_FILE, SESSION_TOKEN lookup block
# Add:
SESSION_TOKEN="${PPID}"

# Change: count files matching PPID pattern
EXISTING=$(ls "${CHECKPOINT_DIR}/${TODAY_DATE}-${PPID}-checkpoint-"*.md 2>/dev/null | wc -l | tr -d ' ')
NN_CP=$(printf "%02d" $(( EXISTING + 1 )))

# Remove: TOKEN_PART conditional — PPID always present
PROMPT="${TODAY_DATE}-${PPID}-checkpoint-${NN_CP}.md"
```

### Hook State Reset After /wrapup and Auto-Summary

After session log write succeeds, reset hook counter to prevent spurious post-wrapup checkpoints:

```bash
TMPDIR_SAFE="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"
echo "0:$(date +%s)" > "${TMPDIR_SAFE}/onebrain-${PPID}.state"
```

This writes `COUNT=0` with fresh timestamp, triggering SKIP_WINDOW (60s) and resetting the message counter.

**State file failure modes:**
- File disappears mid-session: hook re-inits to `COUNT=0, LAST_TS=NOW` — only consequence is delayed next checkpoint
- OS clears temp on restart: hook starts fresh — expected behavior

### /update Full Plugin Sync

Change from hardcoded file list to full folder sync:

- Sync everything under `.claude/plugins/onebrain/` from source repo to vault
- Overwrite all files — plugin folder is source of truth, user customizations belong at project or user level
- Skip `plugin.json` until last step (version bump is the completion signal)
- `update.sh` handles the file copy logic; SKILL.md describes the scope

### Session File Cleanup

**Eliminated.** No `.sessions/` folder, no `.session` temp files. Nothing to clean up.

### /doctor

No new session-related checks needed. Remove any existing `.sessions/` checks if present.

## Files Changed

| File | Change |
|------|--------|
| `hooks/checkpoint-hook.sh` | Use PPID as token; glob-based NN; remove `.sessions/` lookup |
| `skills/wrapup/SKILL.md` | Add hook state reset after write; update checkpoint glob pattern |
| `skills/startup/AUTO-SUMMARY.md` | Add hook state reset after write |
| `skills/update/SKILL.md` | Change to full plugin folder sync |
| `INSTRUCTIONS.md` | Update session_token reference to PPID; update checkpoint glob pattern |

### INSTRUCTIONS.md — Auto Checkpoint Section

The "Auto Checkpoint" section currently reads `session_token` from context and inserts it into the filename. Change to:

1. Get `session_token` via Bash `echo $PPID` (not from context)
2. Glob `[logs_folder]/YYYY/MM/YYYY-MM-DD-{PPID}-checkpoint-*.md` to determine next NN
3. Write to `[logs_folder]/YYYY/MM/YYYY-MM-DD-{PPID}-checkpoint-NN.md`

Remove: "Generate session_token: 6-char random lowercase alphanumeric. Store in context for this session." from Phase 1 Step 3.

## Non-Changes

- `.state` file format unchanged (`COUNT:LAST_TS`)
- No new files in vault or temp
- No `# Summary instructions` section
- Orphan recovery (Step 1b) unchanged — parses token from checkpoint filename as before

## Known Limitations

- PPID-based token is a number (`64791`), not alphanumeric (`k9m3pq`) — aesthetic only, no functional impact
- If Claude Code process PID is reused by OS across different days (rare): checkpoints from different sessions could share a token — orphan recovery handles this correctly by date prefix
