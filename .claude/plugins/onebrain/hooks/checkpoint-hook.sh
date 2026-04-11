#!/usr/bin/env bash
# OneBrain — Checkpoint Hook (Stop)
# Usage: checkpoint-hook.sh stop
#
# stop — fires after every response; checkpoints on message/time threshold
#         Uses JSON {"decision":"block","reason":"..."} to inject prompt back to Claude.
#
# State file: /tmp/onebrain-{PPID}.state (COUNT:LAST_TS)
# COUNT=0 with fresh timestamp in an *existing* state file signals post-checkpoint reset;
# absence of state file = first run.
# MIN_ACTIVITY guard: if fewer than 2 messages since last checkpoint, reset and skip —
# no file is created for sessions with no meaningful activity.

MODE="${1:-stop}"
if [ "$MODE" != "stop" ]; then
  echo "checkpoint-hook.sh: unknown mode '${MODE}' — only 'stop' is supported" >&2
  exit 1
fi
STATE_FILE="/tmp/onebrain-${PPID}.state"
SKIP_WINDOW=60
MIN_ACTIVITY=2  # minimum messages since last checkpoint to warrant a new one
NOW=$(date +%s)

# --- Read or initialize state ---
if [ -f "$STATE_FILE" ]; then
  IFS=':' read -r COUNT LAST_TS < "$STATE_FILE"
  if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || ! [[ "$LAST_TS" =~ ^[0-9]+$ ]]; then
    # Malformed — reset cleanly; COUNT=0 so increment will bring it to 1
    COUNT=0
    LAST_TS=$(stat -f %m "$STATE_FILE" 2>/dev/null || stat -c %Y "$STATE_FILE" 2>/dev/null || echo "$NOW")
  elif [ "$COUNT" -eq 0 ] && [ $(( NOW - LAST_TS )) -lt $SKIP_WINDOW ]; then
    exit 0  # another checkpoint just fired — skip
  fi
else
  COUNT=0; LAST_TS=$NOW
fi

# --- Stop mode: check thresholds against vault.yml config ---
# CLAUDE_PLUGIN_ROOT is set when called from plugin hooks.json; absent from settings.json.
# hooks/ is one level deeper than plugin root, so fallback goes up 4 levels from script dir.
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

MSG_THRESHOLD=$(get_checkpoint_value "messages" 15)
TIME_THRESHOLD=$(( $(get_checkpoint_value "minutes" 30) * 60 ))

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
  # Build JSON first — restore state on python3 failure so future triggers still work
  PROMPT="Auto-checkpoint triggered by ${TRIGGER_LABEL}. Silently save a checkpoint to the vault logs. Steps: (1) Get today's date YYYY-MM-DD, extract YYYY and MM. (2) Count existing checkpoint-*.md files in [logs folder]/YYYY/MM/ to find the next checkpoint number NN (zero-padded, starts at 01). (3) Write [logs folder]/YYYY/MM/YYYY-MM-DD-checkpoint-NN.md with this exact frontmatter: tags: [checkpoint, session-log], date: YYYY-MM-DD, checkpoint: NN, trigger: auto, merged: false. (4) Content sections: ## What We Worked On (2-3 sentences), ## Key Decisions (bullet list), ## Action Items (tasks with date YYYY-MM-DD), ## Open Questions (bullet list). Keep under 250 words total. No output to user."
  JSON=$(python3 -c "import json,sys; print(json.dumps({'decision':'block','reason':sys.argv[1]}))" "$PROMPT" 2>/dev/null)
  if [ -z "$JSON" ]; then
    # python3 unavailable or failed — leave state unchanged so future triggers still work
    exit 1
  fi
  if ! echo "0:${NOW}" > "$STATE_FILE" 2>/dev/null; then
    exit 2
  fi
  printf '%s\n' "$JSON"
else
  echo "${COUNT}:${LAST_TS}" > "$STATE_FILE"
fi
exit 0
