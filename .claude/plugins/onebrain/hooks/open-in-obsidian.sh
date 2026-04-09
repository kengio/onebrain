#!/usr/bin/env bash
# OneBrain — Set Dirty Flag for Deferred Obsidian Open
# PostToolUse hook (Write|Edit). Writes the last-edited file path to a dirty flag.
# obsidian-deferred.sh (Stop hook) reads this and opens Obsidian once per response.

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

# Overwrite flag each time — Stop hook picks up the last file written this response
echo "$FILE_PATH" > "/tmp/onebrain-dirty-${PPID}"
