#!/usr/bin/env bash
# OneBrain — Checkpoint Hook
# Usage: checkpoint-hook.sh stop|precompact|postcompact
#
# stop        — fires after every response; checkpoints on message/time threshold
# precompact  — fires before compact; forces checkpoint unconditionally
# postcompact — fires after compact; resets message counter only
#
# State file: $TMPDIR/onebrain-{SESSION_TOKEN}.state (COUNT:LAST_TS)
# COUNT=0:NOW in an *existing* state file = post-checkpoint stop-hook reset (SKIP_WINDOW active);
# COUNT=0:0 = post-compact reset (compact is not a checkpoint; SKIP_WINDOW does NOT activate);
# absence of state file = first run.
# SKIP_WINDOW=60: prevents re-trigger immediately after a checkpoint resets COUNT to 0.
# MIN_ACTIVITY guard: if fewer than 2 messages since last checkpoint, reset and skip.
#
# Race condition (precompact + stop same turn): both may compute identical checkpoint NN
# before any file is written. Claude receives both JSON blocks; second write overwrites first.
# Impact: last response wins. Accepted as low-probability, non-data-loss outcome.

MODE="${1:-stop}"
case "$MODE" in
  stop|precompact|postcompact) ;;
  *) echo "checkpoint-hook.sh: unknown mode '${MODE}'" >&2; exit 1 ;;
esac

# Windows-compatible temp dir
TMPDIR_SAFE="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"

# Cross-platform session token: avoids $PPID=1 on Windows Git Bash
# Priority: WT_SESSION (Windows Terminal) > PPID>1 (Unix/Mac) > PowerShell PPID > day-cache
_resolve_session_token() {
  # 1. Windows Terminal: each pane/tab gets a unique GUID; strip non-alphanumeric (e.g. leading '{')
  if [ -n "${WT_SESSION:-}" ]; then
    printf '%s' "${WT_SESSION:0:8}" | tr -cd 'a-zA-Z0-9'; return
  fi
  # 2. Unix/Mac: PPID is the Claude Code process PID, unique per window
  if [ -n "${PPID:-}" ] && [ "${PPID}" -gt 1 ] 2>/dev/null; then
    printf '%s' "${PPID}"; return
  fi
  # 3. Windows Git Bash: ask PowerShell for the real parent PID
  if command -v powershell.exe &>/dev/null; then
    local _p
    _p=$(powershell.exe -NoProfile -NonInteractive -Command \
      '(Get-Process -Id $PID).Parent.Id' 2>/dev/null | tr -d '\r\n ')
    [ -n "${_p:-}" ] && [ "${_p}" -gt 1 ] 2>/dev/null && { printf '%s' "${_p}"; return; }
  fi
  # 4. Day-scoped cache (last resort): shared across all windows in this environment.
  #    Known limitation: simultaneous windows will share the same token here.
  local _f="${TMPDIR_SAFE}/ob1-$(date +%Y-%m-%d 2>/dev/null || echo fallback).sid"
  [ -f "$_f" ] || printf '%05d' "$(( RANDOM % 90000 + 10000 ))" > "$_f" 2>/dev/null
  cat "$_f" 2>/dev/null || printf '99999'
}
SESSION_TOKEN="$(_resolve_session_token)"

STATE_FILE="${TMPDIR_SAFE}/onebrain-${SESSION_TOKEN}.state"
if [ -z "${SESSION_TOKEN}" ]; then
  echo "checkpoint-hook.sh: could not resolve session token — aborting checkpoint" >&2
  exit 0
fi
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
if [ -z "$VAULT_ROOT" ]; then
  echo "checkpoint-hook.sh: could not determine vault root — aborting checkpoint" >&2
  exit 0
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
TODAY_DATE=$(date '+%Y-%m-%d' 2>/dev/null || python3 -c "from datetime import date; print(date.today())" 2>/dev/null)
[ -z "$TODAY_DATE" ] && exit 0
if ! [[ "$TODAY_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "checkpoint-hook.sh: invalid date '${TODAY_DATE}' — cannot construct checkpoint path" >&2
  exit 0
fi
CHECKPOINT_DIR="${LOGS_FOLDER_ABS}/${TODAY_DATE%%-*}/$(echo "$TODAY_DATE" | cut -d'-' -f2)"

# --- PostCompact: reset counter so fresh accumulation begins after compact ---
if [ "$MODE" = "postcompact" ]; then
  # Use 0:0 (not 0:NOW) so the Stop hook's SKIP_WINDOW check does not activate —
  # compaction is not a checkpoint, so the next Stop should not be suppressed.
  if ! echo "0:0" > "$STATE_FILE" 2>/dev/null; then
    echo "checkpoint-hook.sh: postcompact state reset failed for ${STATE_FILE}" >&2
  fi
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

# --- PreCompact: force checkpoint before compact, then allow on retry ---
if [ "$MODE" = "precompact" ]; then
  # Single ls call sorted by mtime: check recency of newest file and derive count in one pass.
  _ALL_CPS=$(ls -t "${CHECKPOINT_DIR}/${TODAY_DATE}-${SESSION_TOKEN}-checkpoint-"*.md 2>/dev/null)
  if [ -n "$_ALL_CPS" ]; then
    _LATEST_CP=$(printf '%s\n' "$_ALL_CPS" | head -1)
    _CP_TS=$(stat -f %m "$_LATEST_CP" 2>/dev/null || stat -c %Y "$_LATEST_CP" 2>/dev/null || echo 0)
    if [ "${_CP_TS:-0}" -gt 0 ] && [ $(( NOW - _CP_TS )) -lt 300 ]; then
      exit 0  # checkpoint written within last 5 min — let compact proceed
    fi
    EXISTING=$(printf '%s\n' "$_ALL_CPS" | wc -l | tr -d ' ')
  else
    EXISTING=0
  fi
  # No recent checkpoint — trigger one before allowing compact.
  NN_CP=$(printf "%02d" $(( EXISTING + 1 )))
  PROMPT="${TODAY_DATE}-${SESSION_TOKEN}-checkpoint-${NN_CP}.md"
  JSON=$(build_json "$PROMPT")
  if [ -z "$JSON" ]; then
    echo "checkpoint-hook.sh: build_json failed for '${PROMPT}' — no python/node available?" >&2
    exit 0
  fi
  # Reset state: signals "checkpoint just triggered" to the next PreCompact call
  if ! echo "0:${NOW}" > "$STATE_FILE" 2>/dev/null; then
    echo "checkpoint-hook.sh: precompact state reset failed for ${STATE_FILE}" >&2
  fi
  printf '%s\n' "$JSON"
  exit 0
fi

# --- Stop mode: check thresholds ---
if [ -f "$STATE_FILE" ]; then
  IFS=':' read -r COUNT LAST_TS < "$STATE_FILE"
  if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || ! [[ "$LAST_TS" =~ ^[0-9]+$ ]]; then
    # Malformed — reset cleanly; COUNT=0 so increment will bring it to 1
    echo "checkpoint-hook.sh: malformed state in ${STATE_FILE} — resetting" >&2
    COUNT=0
    LAST_TS=$(stat -f %m "$STATE_FILE" 2>/dev/null || stat -c %Y "$STATE_FILE" 2>/dev/null || node -e "const fs=require('fs');console.log(Math.floor(fs.statSync(process.argv[1]).mtimeMs/1000))" "$STATE_FILE" 2>/dev/null || echo "$NOW")
  elif [ "$COUNT" -eq 0 ] && [ $(( NOW - LAST_TS )) -lt $SKIP_WINDOW ]; then
    exit 0  # another checkpoint just fired — skip
  fi
else
  COUNT=0; LAST_TS=$NOW
fi

COUNT=$(( COUNT + 1 ))
# LAST_TS=0 means post-compact reset (0:0 sentinel) — treat as no elapsed time so the
# time threshold doesn't fire immediately after compact.
ELAPSED=$(( LAST_TS == 0 ? 0 : NOW - LAST_TS ))

if [ "$COUNT" -ge "$MSG_THRESHOLD" ] || [ "$ELAPSED" -ge "$TIME_THRESHOLD" ]; then
  if [ "$COUNT" -lt $MIN_ACTIVITY ]; then
    # Threshold fired but not enough activity — preserve original LAST_TS so the
    # time clock doesn't restart; checkpoint fires on the next message instead.
    echo "${COUNT}:${LAST_TS}" > "$STATE_FILE" 2>/dev/null
    exit 0
  fi
  EXISTING=$(ls "${CHECKPOINT_DIR}/${TODAY_DATE}-${SESSION_TOKEN}-checkpoint-"*.md 2>/dev/null | wc -l | tr -d ' ')
  NN_CP=$(printf "%02d" $(( EXISTING + 1 )))
  PROMPT="${TODAY_DATE}-${SESSION_TOKEN}-checkpoint-${NN_CP}.md"
  JSON=$(build_json "$PROMPT")
  if [ -z "$JSON" ]; then
    echo "checkpoint-hook.sh: build_json failed for '${PROMPT}' — no python/node available?" >&2
    exit 0
  fi
  if ! echo "0:${NOW}" > "$STATE_FILE" 2>/dev/null; then
    # state file not writable — still emit JSON so checkpoint is saved, but count won't reset
    :
  fi
  printf '%s\n' "$JSON"
else
  echo "${COUNT}:${LAST_TS}" > "$STATE_FILE" 2>/dev/null
fi
exit 0
