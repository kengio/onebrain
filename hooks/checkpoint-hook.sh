#!/usr/bin/env bash
# OneBrain — Checkpoint Hook
# Usage: checkpoint-hook.sh stop|precompact|postcompact
#
# stop        — fires after every response; checkpoints on message/time threshold
# precompact  — fires before compact; forces checkpoint unconditionally
# postcompact — fires after compact; resets message counter only
#
# State file: $TMPDIR/onebrain-{PPID}.state (COUNT:LAST_TS)
# COUNT=0 with fresh timestamp in an *existing* state file signals post-checkpoint reset;
# absence of state file = first run.
# SKIP_WINDOW=60: prevents re-trigger immediately after a checkpoint resets COUNT to 0.
# MIN_ACTIVITY guard: if fewer than 2 messages since last checkpoint, reset and skip.

MODE="${1:-stop}"
case "$MODE" in
  stop|precompact|postcompact) ;;
  *) echo "checkpoint-hook.sh: unknown mode '${MODE}'" >&2; exit 1 ;;
esac

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

# --- Vault root detection ---
# CLAUDE_PLUGIN_ROOT is set by Claude Code when plugin is active; absent = called from
# settings.json with a hardcoded path. hooks/ is one level below plugin root, so the fallback
# walks up 4 levels from the script's own directory to reach the vault root.
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  VAULT_ROOT=$(cd "${CLAUDE_PLUGIN_ROOT}/../../.." 2>/dev/null && pwd)
else
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

# --- Session identity (top-level — all modes use these) ---
SESSION_TOKEN="${PPID}"
TODAY_DATE=$(date '+%Y-%m-%d' 2>/dev/null || python3 -c "from datetime import date; print(date.today())" 2>/dev/null)
[ -z "$TODAY_DATE" ] && exit 0
CHECKPOINT_DIR="${LOGS_FOLDER_ABS}/${TODAY_DATE%%-*}/$(echo "$TODAY_DATE" | cut -d'-' -f2)"

# --- PostCompact: reset counter so fresh accumulation begins after compact ---
if [ "$MODE" = "postcompact" ]; then
  echo "0:${NOW}" > "$STATE_FILE" 2>/dev/null
  exit 0
fi

# --- JSON builder (shared by stop + precompact) ---
build_json() {
  local prompt="$1"
  if command -v python3 &>/dev/null; then
    python3 -c "import json,sys; print(json.dumps({'decision':'block','reason':sys.argv[1]}))" "$prompt" 2>/dev/null
  elif command -v python &>/dev/null; then
    python -c "import json,sys; print(json.dumps({'decision':'block','reason':sys.argv[1]}))" "$prompt" 2>/dev/null
  elif command -v node &>/dev/null; then
    node -e "process.stdout.write(JSON.stringify({decision:'block',reason:process.argv[1]})+'\n')" "$prompt" 2>/dev/null
  else
    local escaped
    escaped=$(printf '%s' "$prompt" | tr -d '\r' | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '{"decision":"block","reason":"%s"}\n' "$escaped"
  fi
}

# --- PreCompact: force checkpoint before compact (no threshold check) ---
if [ "$MODE" = "precompact" ]; then
  EXISTING=$(ls "${CHECKPOINT_DIR}/${TODAY_DATE}-${PPID}-checkpoint-"*.md 2>/dev/null | wc -l | tr -d ' ')
  NN_CP=$(printf "%02d" $(( EXISTING + 1 )))
  PROMPT="${TODAY_DATE}-${PPID}-checkpoint-${NN_CP}.md"
  JSON=$(build_json "$PROMPT")
  if [ -z "$JSON" ]; then exit 0; fi
  # Reset state as safety net in case postcompact hook does not fire
  echo "0:${NOW}" > "$STATE_FILE" 2>/dev/null
  printf '%s\n' "$JSON"
  exit 0
fi

# --- Stop mode: check thresholds ---
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

COUNT=$(( COUNT + 1 ))
ELAPSED=$(( NOW - LAST_TS ))

if [ "$COUNT" -ge "$MSG_THRESHOLD" ] || [ "$ELAPSED" -ge "$TIME_THRESHOLD" ]; then
  if [ "$COUNT" -lt $MIN_ACTIVITY ]; then
    # Threshold fired but not enough activity — preserve original LAST_TS so the
    # time clock doesn't restart; checkpoint fires on the next message instead.
    echo "${COUNT}:${LAST_TS}" > "$STATE_FILE" 2>/dev/null
    exit 0
  fi
  EXISTING=$(ls "${CHECKPOINT_DIR}/${TODAY_DATE}-${PPID}-checkpoint-"*.md 2>/dev/null | wc -l | tr -d ' ')
  NN_CP=$(printf "%02d" $(( EXISTING + 1 )))
  PROMPT="${TODAY_DATE}-${PPID}-checkpoint-${NN_CP}.md"
  JSON=$(build_json "$PROMPT")
  if [ -z "$JSON" ]; then
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
