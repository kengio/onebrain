#!/usr/bin/env bash
# OneBrain — Deferred Obsidian Open (Stop Hook)
# Reads dirty flag written by open-in-obsidian.sh, opens Obsidian once, clears flag.
# Runs once at the end of every Claude response — no focus-steal during multi-file writes.

DIRTY_FLAG="/tmp/onebrain-dirty-${PPID}"

if [ ! -f "$DIRTY_FLAG" ]; then exit 0; fi

FILE_PATH=$(cat "$DIRTY_FLAG")
rm -f "$DIRTY_FLAG"

if [ -z "$FILE_PATH" ]; then exit 0; fi

ENCODED=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$FILE_PATH")
open "obsidian://open?path=${ENCODED}"
