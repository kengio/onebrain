#!/usr/bin/env bash
# OneBrain — PreCompact Hook
# Fires before context compression. Skips if auto-checkpoint just ran (within 60s)
# to prevent duplicate checkpoints. Otherwise resets counter and injects prompt.

STATE_FILE="/tmp/onebrain-${PPID}.state"
SKIP_WINDOW=60  # seconds — if auto-checkpoint fired within this window, skip

if [ -f "$STATE_FILE" ]; then
  IFS=':' read -r COUNT LAST_TS < "$STATE_FILE"
  NOW=$(date +%s)
  # COUNT=0 + fresh timestamp = auto-checkpoint just reset the counter
  if [ "$COUNT" -eq 0 ] && [ $(( NOW - LAST_TS )) -lt $SKIP_WINDOW ]; then
    exit 0  # auto-checkpoint already captured this moment — skip
  fi
  echo "0:${NOW}" > "$STATE_FILE"
else
  NOW=$(date +%s)
  echo "0:${NOW}" > "$STATE_FILE"
fi

# Inject checkpoint prompt — Claude processes this before context is compacted
echo "Context compression is imminent. Before compacting, silently save a checkpoint to the vault logs. Steps: (1) Get today's date YYYY-MM-DD, extract YYYY and MM. (2) Count existing checkpoint-*.md files in [logs_folder]/YYYY/MM/ to find the next checkpoint number NN (zero-padded, starts at 01). (3) Write [logs_folder]/YYYY/MM/YYYY-MM-DD-checkpoint-NN.md with this exact frontmatter: tags: [checkpoint, session-log], date: YYYY-MM-DD, checkpoint: NN, trigger: precompact, merged: false. (4) Content sections: '## What We Worked On' (2-3 sentences), '## Key Decisions' (bullet list), '## Action Items' (tasks with 📅 YYYY-MM-DD dates), '## Open Questions' (bullet list). Keep under 250 words total. No output to user."
