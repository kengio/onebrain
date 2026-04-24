#!/usr/bin/env bash
# OneBrain Checkpoint Hook
# What this does: records a context snapshot to your local vault before Claude
# compresses its memory. No network calls. No data leaves your vault. Pure local
# file writes to your Obsidian vault's logs/ folder.
#
# Usage: checkpoint-hook.sh stop|precompact|postcompact
#
# stop        — fires after every response; checkpoints on message/time threshold
# precompact  — fires before compact; checkpoints unless one was written in the last 5 minutes
# postcompact — fires after compact; resets message counter only
#
# State file: $TMPDIR/onebrain-{session_token}.state (count:last_ts)
# count=0:now in an *existing* state file = post-checkpoint stop-hook reset (SKIP_WINDOW active);
# count=0:0 = post-compact reset (compact is not a checkpoint; SKIP_WINDOW does NOT activate);
# absence of state file = first run.
# SKIP_WINDOW=60: prevents re-trigger immediately after a checkpoint resets count to 0.
# MIN_ACTIVITY guard: if fewer than 2 messages since last checkpoint, reset and skip.
#
# Race condition (precompact + stop same turn): both may compute identical checkpoint NN
# before any file is written. Claude receives both JSON blocks; second write overwrites first.
# Impact: last response wins. Accepted as low-probability, non-data-loss outcome.

mode="${1:-stop}"
case "$mode" in
  stop|precompact|postcompact) ;;
  *) echo "checkpoint-hook.sh: unknown mode '${mode}'" >&2; exit 1 ;;
esac

# Windows-compatible temp dir
tmpdir_safe="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"

# Cross-platform session token: avoids $PPID=1 on Windows Git Bash
# Priority: WT_SESSION (Windows Terminal) > PPID>1 (Unix/Mac) > PowerShell PPID > day-cache
_resolve_session_token() {
  # 1. Windows Terminal: each pane/tab gets a unique GUID; strip non-alphanumeric first (e.g. leading
  #    '{'), then take 8 chars — ensures full 8-char token regardless of punctuation position.
  if [ -n "${WT_SESSION:-}" ]; then
    printf '%s' "$WT_SESSION" | tr -cd 'a-zA-Z0-9' | cut -c1-8; return
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
    if [ -n "${_p:-}" ] && [ "${_p}" -gt 1 ] 2>/dev/null; then
      printf '%s' "${_p}"; return
    fi
    echo "checkpoint-hook.sh: PowerShell PID lookup failed — falling back to day-cache (collision risk)" >&2
  fi
  # 4. Day-scoped cache (last resort): shared across all windows in this environment.
  #    Known limitation: simultaneous windows will share the same token here.
  #    If write fails, '99999' is intentional — all sessions share a single known fallback token.
  local _f="${tmpdir_safe}/ob1-$(date +%Y-%m-%d 2>/dev/null || echo fallback).sid"
  [ -f "$_f" ] || printf '%05d' "$(( RANDOM % 90000 + 10000 ))" > "$_f" 2>/dev/null
  cat "$_f" 2>/dev/null || printf '99999'
}
session_token="$(_resolve_session_token)"
if [ -z "${session_token}" ]; then
  echo "checkpoint-hook.sh: could not resolve session token — aborting checkpoint" >&2
  exit 0
fi
state_file="${tmpdir_safe}/onebrain-${session_token}.state"
readonly SKIP_WINDOW=60
readonly MIN_ACTIVITY=2  # minimum messages since last checkpoint to warrant a new one

# Unix epoch — try date, then node, then python
now=$(date +%s 2>/dev/null)
if [ -z "$now" ] || [ "$now" = "0" ]; then
  now=$(node -e "console.log(Math.floor(Date.now()/1000))" 2>/dev/null)
fi
if [ -z "$now" ] || [ "$now" = "0" ]; then
  now=$(python3 -c "import time; print(int(time.time()))" 2>/dev/null || python -c "import time; print(int(time.time()))" 2>/dev/null)
fi
[ -z "$now" ] && now=0
# If epoch is unavailable, skip entirely — a zero timestamp cannot be used for threshold calculations
if [ "$now" -eq 0 ]; then exit 0; fi

# --- Vault root detection ---
# CLAUDE_PLUGIN_ROOT is set by Claude Code when plugin is active; absent = called from
# settings.json with a hardcoded path. hooks/ is one level below plugin root, so the fallback
# walks up 4 levels from the script's own directory to reach the vault root.
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ]; then
  vault_root=$(cd "${CLAUDE_PLUGIN_ROOT}/../../.." 2>/dev/null && pwd)
else
  script_dir=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
  vault_root=$(cd "${script_dir}/../../../.." 2>/dev/null && pwd)
fi
if [ -z "$vault_root" ]; then
  echo "checkpoint-hook.sh: could not determine vault root — aborting checkpoint" >&2
  exit 0
fi
vault_yml="${vault_root:+${vault_root}/vault.yml}"

get_checkpoint_value() {
  local key="$1" default="$2"
  [ -z "$vault_yml" ] && echo "$default" && return
  [ -f "$vault_yml" ] || { echo "$default"; return; }
  local in_block=0 value=""
  while IFS= read -r line; do
    if [[ "$line" =~ ^checkpoint: ]]; then in_block=1; continue; fi
    if [[ $in_block -eq 1 ]]; then
      if [[ "$line" =~ ^[[:space:]]+${key}:[[:space:]]*([0-9]+) ]]; then
        value="${BASH_REMATCH[1]}"; break
      fi
      if [[ "$line" =~ ^[^[:space:]] ]]; then break; fi
    fi
  done < "$vault_yml"
  echo "${value:-$default}"
}

get_folder_value() {
  local key="$1" default="$2"
  [ -z "$vault_yml" ] && echo "$default" && return
  [ -f "$vault_yml" ] || { echo "$default"; return; }
  local in_block=0 value=""
  while IFS= read -r line; do
    if [[ "$line" =~ ^folders: ]]; then in_block=1; continue; fi
    if [[ $in_block -eq 1 ]]; then
      if [[ "$line" =~ ^[[:space:]]+${key}:[[:space:]]*(.+) ]]; then
        value="${BASH_REMATCH[1]}"; value="${value//\"/}"; value="${value//\'/}"; value="${value#"${value%%[![:space:]]*}"}"; value="${value%"${value##*[![:space:]]}"}"; break
      fi
      if [[ "$line" =~ ^[^[:space:]] ]]; then break; fi
    fi
  done < "$vault_yml"
  echo "${value:-$default}"
}

msg_threshold=$(get_checkpoint_value "messages" 15)
time_threshold=$(( $(get_checkpoint_value "minutes" 30) * 60 ))
logs_folder=$(get_folder_value "logs" "07-logs")
logs_folder_abs="${vault_root:+${vault_root}/}${logs_folder}"

# --- Session identity (top-level — all modes use these) ---
today_date=$(date '+%Y-%m-%d' 2>/dev/null || python3 -c "from datetime import date; print(date.today())" 2>/dev/null)
[ -z "$today_date" ] && exit 0
if ! [[ "$today_date" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "checkpoint-hook.sh: invalid date '${today_date}' — cannot construct checkpoint path" >&2
  exit 0
fi
checkpoint_dir="${logs_folder_abs}/${today_date%%-*}/$(echo "$today_date" | cut -d'-' -f2)"

# --- PostCompact: reset counter so fresh accumulation begins after compact ---
if [ "$mode" = "postcompact" ]; then
  # Use 0:0 (not 0:now) so the Stop hook's SKIP_WINDOW check does not activate —
  # compaction is not a checkpoint, so the next Stop should not be suppressed.
  if ! echo "0:0" > "$state_file" 2>/dev/null; then
    echo "checkpoint-hook.sh: postcompact state reset failed for ${state_file}" >&2
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
if [ "$mode" = "precompact" ]; then
  # Single ls call sorted by mtime: check recency of newest file and derive count in one pass.
  all_cps=$(ls -t "${checkpoint_dir}/${today_date}-${session_token}-checkpoint-"*.md 2>/dev/null)
  if [ -n "$all_cps" ]; then
    latest_cp=$(printf '%s\n' "$all_cps" | head -1)
    cp_ts=$(stat -f %m "$latest_cp" 2>/dev/null || stat -c %Y "$latest_cp" 2>/dev/null || echo 0)
    if [ "${cp_ts:-0}" -gt 0 ] && [ $(( now - cp_ts )) -lt 300 ]; then
      exit 0  # checkpoint written within last 5 min — let compact proceed
    fi
    existing=$(printf '%s\n' "$all_cps" | wc -l | tr -d ' ')
  else
    existing=0
  fi
  # No recent checkpoint — trigger one before allowing compact.
  nn_cp=$(printf "%02d" $(( existing + 1 )))
  cp_filename="${today_date}-${session_token}-checkpoint-${nn_cp}.md"
  json=$(build_json "$cp_filename")
  if [ -z "$json" ]; then
    echo "checkpoint-hook.sh: build_json failed for '${cp_filename}' — no python/node available?" >&2
    exit 0
  fi
  # Reset state: signals "checkpoint just triggered" to the next PreCompact call
  if ! echo "0:${now}" > "$state_file" 2>/dev/null; then
    echo "checkpoint-hook.sh: precompact state reset failed for ${state_file}" >&2
  fi
  printf '%s\n' "$json"
  exit 0
fi

# --- Stop mode: check thresholds ---
if [ -f "$state_file" ]; then
  IFS=':' read -r count last_ts < "$state_file"
  if ! [[ "$count" =~ ^[0-9]+$ ]] || ! [[ "$last_ts" =~ ^[0-9]+$ ]]; then
    # Malformed — reset cleanly; count=0 so increment will bring it to 1
    echo "checkpoint-hook.sh: malformed state in ${state_file} — resetting" >&2
    count=0
    last_ts=$(stat -f %m "$state_file" 2>/dev/null || stat -c %Y "$state_file" 2>/dev/null || node -e "const fs=require('fs');console.log(Math.floor(fs.statSync(process.argv[1]).mtimeMs/1000))" "$state_file" 2>/dev/null || echo "$now")
  elif [ "$count" -eq 0 ] && [ $(( now - last_ts )) -lt $SKIP_WINDOW ]; then
    exit 0  # another checkpoint just fired — skip
  fi
else
  count=0; last_ts=$now
fi

count=$(( count + 1 ))
# last_ts=0 means post-compact reset (0:0 sentinel) — treat as no elapsed time so the
# time threshold doesn't fire immediately after compact.
elapsed=$(( last_ts == 0 ? 0 : now - last_ts ))

if [ "$count" -ge "$msg_threshold" ] || [ "$elapsed" -ge "$time_threshold" ]; then
  if [ "$count" -lt $MIN_ACTIVITY ]; then
    # Threshold fired but not enough activity — preserve original last_ts so the
    # time clock doesn't restart; checkpoint fires on the next message instead.
    echo "${count}:${last_ts}" > "$state_file" 2>/dev/null
    exit 0
  fi
  existing=$(ls "${checkpoint_dir}/${today_date}-${session_token}-checkpoint-"*.md 2>/dev/null | wc -l | tr -d ' ')
  nn_cp=$(printf "%02d" $(( existing + 1 )))
  cp_filename="${today_date}-${session_token}-checkpoint-${nn_cp}.md"
  json=$(build_json "$cp_filename")
  if [ -z "$json" ]; then
    echo "checkpoint-hook.sh: build_json failed for '${cp_filename}' — no python/node available?" >&2
    exit 0
  fi
  if ! echo "0:${now}" > "$state_file" 2>/dev/null; then
    echo "checkpoint-hook.sh: state write failed for ${state_file} — count will not reset, checkpoint may repeat" >&2
  fi
  printf '%s\n' "$json"
else
  echo "${count}:${last_ts}" > "$state_file" 2>/dev/null
fi
exit 0
