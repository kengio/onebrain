#!/usr/bin/env bash
# OneBrain — Set Dirty Flag for Deferred Obsidian Open
# PostToolUse hook (Write|Edit). Appends each edited file path to a dirty flag.
# obsidian-deferred.sh (Stop hook) reads all paths and opens each in Obsidian once.

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', '') or '')
except Exception:
    print('')
" 2>/dev/null)

if [ -z "$FILE_PATH" ]; then exit 0; fi

# Append path — Stop hook collects all files written this response
printf '%s\n' "$FILE_PATH" >> "/tmp/onebrain-dirty-${PPID}"
