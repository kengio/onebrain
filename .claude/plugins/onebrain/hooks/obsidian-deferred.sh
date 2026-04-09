#!/usr/bin/env bash
# OneBrain — Deferred Obsidian Open (Stop Hook)
# Reads all paths appended by open-in-obsidian.sh, opens each in Obsidian, clears flag.
# Runs once at the end of every Claude response — no focus-steal during multi-file writes.

DIRTY_FLAG="/tmp/onebrain-dirty-${PPID}"

if [ ! -f "$DIRTY_FLAG" ]; then exit 0; fi

# Read all paths then immediately clear the flag
PATHS=$(cat "$DIRTY_FLAG")
rm -f "$DIRTY_FLAG"

if [ -z "$PATHS" ]; then exit 0; fi

# Bail early if plugin root is unset — can't safely compute vault boundary
if [ -z "${CLAUDE_PLUGIN_ROOT:-}" ]; then exit 0; fi

VAULT_ROOT="$(cd "${CLAUDE_PLUGIN_ROOT}/../../.." && pwd)"

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

open_in_obsidian() {
  local file_path="$1"
  local encoded
  encoded=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1], safe='/:@'))" "$file_path")
  case "$OSTYPE" in
    darwin*)
      open "obsidian://open?path=${encoded}"
      ;;
    linux-gnu*|linux*)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        cmd.exe /c start "" "obsidian://open?path=${encoded}" 2>/dev/null
      else
        xdg-open "obsidian://open?path=${encoded}" 2>/dev/null
      fi
      ;;
    msys*|cygwin*)
      cmd.exe /c start "" "obsidian://open?path=${encoded}" 2>/dev/null
      ;;
  esac
}

# Deduplicate paths (sort -u is POSIX, works on bash 3.2)
PATHS=$(printf '%s' "$PATHS" | sort -u)

# Open each qualifying file
while IFS= read -r FILE_PATH; do
  [ -z "$FILE_PATH" ] && continue

  # Only open files inside the vault
  case "$FILE_PATH" in
    "$VAULT_ROOT"/*) ;;
    *) continue ;;
  esac

  # Skip plugin internals, agent files, logs, attachments
  RELATIVE="${FILE_PATH#$VAULT_ROOT/}"
  case "$RELATIVE" in
    .claude/*|attachments/*) continue ;;
  esac
  if [ -n "$AGENT_FOLDER" ] && echo "$RELATIVE" | grep -q "^${AGENT_FOLDER}/"; then continue; fi
  if [ -n "$LOGS_FOLDER" ] && echo "$RELATIVE" | grep -q "^${LOGS_FOLDER}/"; then continue; fi

  open_in_obsidian "$FILE_PATH"
done <<< "$PATHS"
