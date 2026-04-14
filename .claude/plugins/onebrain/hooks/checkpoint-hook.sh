#!/usr/bin/env bash
# OneBrain — Checkpoint Hook (Stop)
# Usage: checkpoint-hook.sh stop
#
# stop — fires after every response; checkpoints on message/time threshold
#         Uses JSON {"decision":"block","reason":"..."} to inject prompt back to Claude.
#
# State file: $TMPDIR/onebrain-{PPID}.state (COUNT:LAST_TS) — uses $TMPDIR/$TEMP/$TMP for Windows compat
# COUNT=0 with fresh timestamp in an *existing* state file signals post-checkpoint reset;
# absence of state file = first run.
# SKIP_WINDOW=60: prevents re-trigger immediately after a checkpoint resets COUNT to 0.
# MIN_ACTIVITY guard: if fewer than 2 messages since last checkpoint, reset and skip —
# no file is created for sessions with no meaningful activity.

MODE="${1:-stop}"
if [ "$MODE" != "stop" ]; then
  echo "checkpoint-hook.sh: unknown mode '${MODE}' — only 'stop' is supported" >&2
  exit 1
fi
# Windows-compatible temp dir
TMPDIR_SAFE="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"
STATE_FILE="${TMPDIR_SAFE}/onebrain-${PPID}.state"
SKIP_WINDOW=60
MIN_ACTIVITY=2  # minimum messages since last checkpoint to warrant a new one

# Unix epoch — try date, then node, then python
NOW=$(date +%s 2>/dev/null)
if [ -z "$NOW" ] || [ "$NOW" = "0" ]; then
  NOW=$(node -e "console.log(Math.floor(Date.now()/1000))" 2>/dev/null)
fi
if [ -z "$NOW" ] || [ "$NOW" = "0" ]; then
  NOW=$(python3 -c "import time; print(int(time.time()))" 2>/dev/null || python -c "import time; print(int(time.time()))" 2>/dev/null)
fi
[ -z "$NOW" ] && NOW=0
# If epoch is unavailable, skip entirely — writing "0:0" would lock future runs via SKIP_WINDOW
if [ "$NOW" -eq 0 ]; then exit 0; fi

# --- Read or initialize state ---
if [ -f "$STATE_FILE" ]; then
  IFS=':' read -r COUNT LAST_TS < "$STATE_FILE"
  if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || ! [[ "$LAST_TS" =~ ^[0-9]+$ ]]; then
    # Malformed — reset cleanly; COUNT=0 so increment will bring it to 1
    COUNT=0
    LAST_TS=$(stat -f %m "$STATE_FILE" 2>/dev/null || stat -c %Y "$STATE_FILE" 2>/dev/null || node -e "const fs=require('fs');console.log(Math.floor(fs.statSync(process.argv[1]).mtimeMs/1000))" "$STATE_FILE" 2>/dev/null || echo "$NOW")
  elif [ "$COUNT" -eq 0 ] && [ $(( NOW - LAST_TS )) -lt $SKIP_WINDOW ]; then
    exit 0  # another checkpoint just fired — skip
  fi
else
  COUNT=0; LAST_TS=$NOW
fi

# --- Stop mode: check thresholds against vault.yml config ---
# Stop hooks cannot be registered in plugin hooks.json — Claude Code does not fire them there.
# This script must be registered in the user's ~/.claude/settings.json directly.
# CLAUDE_PLUGIN_ROOT is set by Claude Code when the plugin is active; absent = called from
# settings.json with a hardcoded path. hooks/ is one level below plugin root, so the fallback
# walks up 4 levels from the script's own directory to reach the vault root.
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  VAULT_ROOT=$(cd "${CLAUDE_PLUGIN_ROOT}/../../.." 2>/dev/null && pwd)
else
  # Fallback: derive from script path (used when called from settings.json)
  SCRIPT_DIR=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
  VAULT_ROOT=$(cd "${SCRIPT_DIR}/../../../.." 2>/dev/null && pwd)
fi
VAULT_YML="${VAULT_ROOT:+${VAULT_ROOT}/vault.yml}"

get_checkpoint_value() {
  local key="$1" default="$2"
  [ -z "$VAULT_YML" ] && echo "$default" && return
  [ -f "$VAULT_YML" ] || { echo "$default"; return; }
  local in_block=0 value=""
  while IFS= read -r line; do
    if [[ "$line" =~ ^checkpoint: ]]; then in_block=1; continue; fi
    if [[ $in_block -eq 1 ]]; then
      if [[ "$line" =~ ^[[:space:]]+${key}:[[:space:]]*([0-9]+) ]]; then
        value="${BASH_REMATCH[1]}"; break
      fi
      if [[ "$line" =~ ^[^[:space:]] ]]; then break; fi
    fi
  done < "$VAULT_YML"
  echo "${value:-$default}"
}

get_folder_value() {
  local key="$1" default="$2"
  [ -z "$VAULT_YML" ] && echo "$default" && return
  [ -f "$VAULT_YML" ] || { echo "$default"; return; }
  local in_block=0 value=""
  while IFS= read -r line; do
    if [[ "$line" =~ ^folders: ]]; then in_block=1; continue; fi
    if [[ $in_block -eq 1 ]]; then
      if [[ "$line" =~ ^[[:space:]]+${key}:[[:space:]]*(.+) ]]; then
        value="${BASH_REMATCH[1]}"; value="${value//\"/}"; value="${value//\'/}"; value="${value#"${value%%[![:space:]]*}"}"; value="${value%"${value##*[![:space:]]}"}"; break
      fi
      if [[ "$line" =~ ^[^[:space:]] ]]; then break; fi
    fi
  done < "$VAULT_YML"
  echo "${value:-$default}"
}

MSG_THRESHOLD=$(get_checkpoint_value "messages" 15)
TIME_THRESHOLD=$(( $(get_checkpoint_value "minutes" 30) * 60 ))
LOGS_FOLDER=$(get_folder_value "logs" "07-logs")
LOGS_FOLDER_ABS="${VAULT_ROOT:+${VAULT_ROOT}/}${LOGS_FOLDER}"

COUNT=$(( COUNT + 1 ))
ELAPSED=$(( NOW - LAST_TS ))

if [ "$COUNT" -ge "$MSG_THRESHOLD" ] || [ "$ELAPSED" -ge "$TIME_THRESHOLD" ]; then
  if [ "$COUNT" -lt $MIN_ACTIVITY ]; then
    # Threshold fired on time but not enough activity — reset and wait next round
    echo "0:${NOW}" > "$STATE_FILE" 2>/dev/null
    exit 0
  fi
  if [ "$COUNT" -ge "$MSG_THRESHOLD" ]; then
    TRIGGER_LABEL="auto (${COUNT} messages)"
  else
    TRIGGER_LABEL="auto ($(( ELAPSED / 60 ))m elapsed)"
  fi
  # Build JSON first — restore state on json builder failure so future triggers still work
  PROMPT="Auto-checkpoint triggered by ${TRIGGER_LABEL}. Silently save a checkpoint to the vault logs. Steps: (1) Get today's date YYYY-MM-DD, extract YYYY and MM. (2) Count existing YYYY-MM-DD-checkpoint-*.md files in ${LOGS_FOLDER_ABS}/YYYY/MM/ (using today's actual date in the filename pattern) to find the next checkpoint number NN (zero-padded, starts at 01). (3) Write ${LOGS_FOLDER_ABS}/YYYY/MM/YYYY-MM-DD-checkpoint-NN.md with this exact frontmatter: tags: [checkpoint, session-log], date: YYYY-MM-DD, checkpoint: NN, trigger: auto, merged: false. (4) Content sections: ## What We Worked On (2-3 sentences), ## Key Decisions (bullet list), ## Action Items (tasks with date YYYY-MM-DD), ## Open Questions (bullet list). Keep under 250 words total. No output to user."
  # Try python3, python, node in order — Windows may only have 'python' or 'node'
  if command -v python3 &>/dev/null; then
    JSON=$(python3 -c "import json,sys; print(json.dumps({'decision':'block','reason':sys.argv[1]}))" "$PROMPT" 2>/dev/null)
  elif command -v python &>/dev/null; then
    JSON=$(python -c "import json,sys; print(json.dumps({'decision':'block','reason':sys.argv[1]}))" "$PROMPT" 2>/dev/null)
  elif command -v node &>/dev/null; then
    JSON=$(node -e "process.stdout.write(JSON.stringify({decision:'block',reason:process.argv[1]})+'\n')" "$PROMPT" 2>/dev/null)
  else
    ESCAPED=$(printf '%s' "$PROMPT" | tr -d '\r' | sed 's/\\/\\\\/g; s/"/\\"/g')
    JSON="{\"decision\":\"block\",\"reason\":\"${ESCAPED}\"}"
  fi
  if [ -z "$JSON" ]; then
    # all builders failed — skip checkpoint silently (exit 0 avoids Claude Code error warning)
    exit 0
  fi
  if ! echo "0:${NOW}" > "$STATE_FILE" 2>/dev/null; then
    # state file not writable — still emit JSON so checkpoint is saved, but count won't reset
    :
  fi
  printf '%s\n' "$JSON"
else
  echo "${COUNT}:${LAST_TS}" > "$STATE_FILE"
fi
exit 0
