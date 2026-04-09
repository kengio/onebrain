#!/usr/bin/env bash
# OneBrain — Deferred Obsidian Open (Stop Hook)
# Reads dirty flag written by open-in-obsidian.sh, opens Obsidian once, clears flag.
# Runs once at the end of every Claude response — no focus-steal during multi-file writes.

DIRTY_FLAG="/tmp/onebrain-dirty-${PPID}"

if [ ! -f "$DIRTY_FLAG" ]; then exit 0; fi

FILE_PATH=$(cat "$DIRTY_FLAG")
rm -f "$DIRTY_FLAG"

if [ -z "$FILE_PATH" ]; then exit 0; fi

# Only open files inside the vault
VAULT_ROOT="$(cd "${CLAUDE_PLUGIN_ROOT}/../../.." && pwd)"
case "$FILE_PATH" in
  "$VAULT_ROOT"/*) ;;  # inside vault — proceed
  *) exit 0 ;;         # outside vault — skip silently
esac

# Only open content files (skip plugin internals, logs, agent files)
RELATIVE="${FILE_PATH#$VAULT_ROOT/}"
case "$RELATIVE" in
  .claude/*|05-agent/*|07-logs/*|attachments/*) exit 0 ;;
esac

ENCODED=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe='/:@'))" "$FILE_PATH")
case "$OSTYPE" in
  darwin*)
    open "obsidian://open?path=${ENCODED}"
    ;;
  linux-gnu*|linux*)
    if grep -qi microsoft /proc/version 2>/dev/null; then
      # WSL — delegate to Windows
      cmd.exe /c start "" "obsidian://open?path=${ENCODED}" 2>/dev/null
    else
      xdg-open "obsidian://open?path=${ENCODED}" 2>/dev/null
    fi
    ;;
  msys*|cygwin*)
    cmd.exe /c start "" "obsidian://open?path=${ENCODED}" 2>/dev/null
    ;;
esac
