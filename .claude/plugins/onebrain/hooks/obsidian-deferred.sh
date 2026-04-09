#!/usr/bin/env bash
# OneBrain — Deferred Obsidian Open (Stop Hook)
# Reads dirty flag written by open-in-obsidian.sh, opens Obsidian once, clears flag.
# Runs once at the end of every Claude response — no focus-steal during multi-file writes.

DIRTY_FLAG="/tmp/onebrain-dirty-${PPID}"

if [ ! -f "$DIRTY_FLAG" ]; then exit 0; fi

FILE_PATH=$(cat "$DIRTY_FLAG")
rm -f "$DIRTY_FLAG"

if [ -z "$FILE_PATH" ]; then exit 0; fi

# Bail early if plugin root is unset — can't safely compute vault boundary
if [ -z "${CLAUDE_PLUGIN_ROOT:-}" ]; then exit 0; fi

# Only open files inside the vault
VAULT_ROOT="$(cd "${CLAUDE_PLUGIN_ROOT}/../../.." && pwd)"
case "$FILE_PATH" in
  "$VAULT_ROOT"/*) ;;  # inside vault — proceed
  *) exit 0 ;;         # outside vault — skip silently
esac

# Read folder names from vault.yml (defaults: 05-agent, 07-logs)
VAULT_YML="${VAULT_ROOT}/vault.yml"
AGENT_FOLDER="05-agent"
LOGS_FOLDER="07-logs"
if [ -f "$VAULT_YML" ]; then
  in_folders=0
  while IFS= read -r line; do
    if echo "$line" | grep -q '^folders:'; then in_folders=1; continue; fi
    if [ "$in_folders" -eq 1 ]; then
      if echo "$line" | grep -q '^[a-z]'; then in_folders=0; fi
      if echo "$line" | grep -q '^\s*agent:'; then
        AGENT_FOLDER=$(echo "$line" | sed 's/.*agent:[[:space:]]*//' | tr -d '"'"'"' ')
      fi
      if echo "$line" | grep -q '^\s*logs:'; then
        LOGS_FOLDER=$(echo "$line" | sed 's/.*logs:[[:space:]]*//' | tr -d '"'"'"' ')
      fi
    fi
  done < "$VAULT_YML"
fi

# Only open content files (skip plugin internals, agent files, logs, attachments)
RELATIVE="${FILE_PATH#$VAULT_ROOT/}"
case "$RELATIVE" in
  .claude/*|attachments/*) exit 0 ;;
esac
if [ -n "$AGENT_FOLDER" ] && echo "$RELATIVE" | grep -q "^${AGENT_FOLDER}/"; then exit 0; fi
if [ -n "$LOGS_FOLDER" ] && echo "$RELATIVE" | grep -q "^${LOGS_FOLDER}/"; then exit 0; fi

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
