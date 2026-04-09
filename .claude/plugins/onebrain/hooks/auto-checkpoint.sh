#!/usr/bin/env bash
# OneBrain — Auto-Checkpoint Stop Hook
# Fires after every Claude response. Tracks message count + elapsed time.
# Skips if any checkpoint hook ran within 60s (COUNT=0 in existing state file).
# Config is read from vault.yml (single source of truth).

STATE_FILE="/tmp/onebrain-${PPID}.state"
SKIP_WINDOW=60  # seconds — skip if another checkpoint hook just fired

# Derive vault root from plugin path and read vault.yml
VAULT_ROOT="$(cd "${CLAUDE_PLUGIN_ROOT}/../../.." && pwd)"
VAULT_YML="${VAULT_ROOT}/vault.yml"

get_checkpoint_value() {
  local key="$1" default="$2"
  [ -f "$VAULT_YML" ] || { echo "$default"; return; }
  local in_block=0 value=""
  while IFS= read -r line; do
    if [[ "$line" =~ ^checkpoint: ]]; then
      in_block=1
      continue
    fi
    if [[ $in_block -eq 1 ]]; then
      if [[ "$line" =~ ^[[:space:]]+${key}:[[:space:]]*([0-9]+) ]]; then
        value="${BASH_REMATCH[1]}"
        break
      fi
      # Stop at next top-level key
      if [[ "$line" =~ ^[^[:space:]] ]]; then
        break
      fi
    fi
  done < "$VAULT_YML"
  echo "${value:-$default}"
}

MSG_THRESHOLD=$(get_checkpoint_value "messages" 15)
TIME_THRESHOLD=$(( $(get_checkpoint_value "minutes" 30) * 60 ))

# Compute current timestamp
NOW=$(date +%s)

# Read or initialise state
if [ -f "$STATE_FILE" ]; then
  IFS=':' read -r COUNT LAST_TS < "$STATE_FILE"
  # Guard against malformed state file
  if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || ! [[ "$LAST_TS" =~ ^[0-9]+$ ]]; then
    COUNT=1  # treat as not-fresh, fall through
  # COUNT=0 in existing file = a hook explicitly reset after a checkpoint — skip if fresh
  elif [ "$COUNT" -eq 0 ] && [ $(( NOW - LAST_TS )) -lt $SKIP_WINDOW ]; then
    exit 0  # another checkpoint hook just fired — skip
  fi
else
  # First run — initialise state (COUNT=0 here is not a hook reset)
  COUNT=0
  LAST_TS=$NOW
fi

COUNT=$(( COUNT + 1 ))
ELAPSED=$(( NOW - LAST_TS ))

if [ "$COUNT" -ge "$MSG_THRESHOLD" ] || [ "$ELAPSED" -ge "$TIME_THRESHOLD" ]; then
  # Determine trigger label
  if [ "$COUNT" -ge "$MSG_THRESHOLD" ]; then
    TRIGGER_LABEL="auto (${COUNT} messages)"
  else
    TRIGGER_LABEL="auto ($(( ELAPSED / 60 ))m elapsed)"
  fi

  # Reset state
  echo "0:${NOW}" > "$STATE_FILE"

  # Inject checkpoint prompt
  echo "Auto-checkpoint triggered by ${TRIGGER_LABEL}. Silently save a checkpoint to the vault logs. Steps: (1) Get today's date YYYY-MM-DD, extract YYYY and MM. (2) Count existing checkpoint-*.md files in [logs_folder]/YYYY/MM/ to find the next checkpoint number NN (zero-padded, starts at 01). (3) Write [logs_folder]/YYYY/MM/YYYY-MM-DD-checkpoint-NN.md with this exact frontmatter: tags: [checkpoint, session-log], date: YYYY-MM-DD, checkpoint: NN, trigger: auto, merged: false. (4) Content sections: '## What We Worked On' (2-3 sentences), '## Key Decisions' (bullet list), '## Action Items' (tasks with 📅 YYYY-MM-DD dates), '## Open Questions' (bullet list). Keep under 250 words total. No output to user."
else
  # Update count only — keep original timestamp until checkpoint fires
  echo "${COUNT}:${LAST_TS}" > "$STATE_FILE"
fi
