#!/usr/bin/env bash
# open-in-obsidian.sh — PostToolUse hook
# Opens a vault file in Obsidian after Write/Edit tool use.
# Scoped to content folders only. Enforces vault boundary.
# Always exits 0 — never blocks Claude Code.

# No set -euo pipefail — this is a hook script where resilience matters over
# strictness. Every code path must exit 0 gracefully; pipefail would cause
# silent crashes on malformed input instead of the intended graceful no-ops.

# ── Debug logging ────────────────────────────────────────────────────────────
LOG=""
if [ "${DEBUG:-}" = "1" ]; then
  LOG="/tmp/onebrain-hook-debug.log"
  # Truncate log if over 1MB to prevent unbounded growth
  [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ] && : > "$LOG"
  echo "[$(date -Iseconds)] open-in-obsidian.sh started" >> "$LOG"
fi
log() { [ -n "$LOG" ] && echo "[$(date -Iseconds)] $*" >> "$LOG" || true; }

# ── Read stdin ────────────────────────────────────────────────────────────────
input=$(cat)

# ── Extract file_path ─────────────────────────────────────────────────────────
if ! command -v jq &>/dev/null; then
  log "jq not found, exiting"
  exit 0
fi

file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [ -z "$file_path" ]; then
  log "file_path empty or missing, exiting"
  exit 0
fi
log "file_path: $file_path"

# ── Resolve absolute path ──────────────────────────────────────────────────────
if command -v realpath &>/dev/null; then
  abs_path=$(realpath -m "$file_path" 2>/dev/null || echo "$file_path")
else
  abs_path=$(cd "$(dirname "$file_path")" 2>/dev/null && echo "$(pwd)/$(basename "$file_path")" || echo "$file_path")
fi
log "abs_path: $abs_path"

# ── Vault boundary check ───────────────────────────────────────────────────────
vault_root="${CLAUDE_PROJECT_DIR%/}"
abs_path="${abs_path%/}"

if [ -z "$vault_root" ]; then
  log "CLAUDE_PROJECT_DIR not set, exiting"
  exit 0
fi

if [[ "$abs_path" != "$vault_root"/* ]]; then
  log "file outside vault, exiting"
  exit 0
fi

# ── Read content folders from vault.yml ───────────────────────────────────────
# Pure bash — no Python required
read_content_folders() {
  # $vault_root is set from $CLAUDE_PROJECT_DIR (trailing slash already stripped)
  local yml="$vault_root/vault.yml"
  [ -f "$yml" ] || return 1
  local in_folders=0 result=""
  local content_keys="inbox projects areas knowledge resources"
  while IFS= read -r line || [ -n "$line" ]; do
    # Exit folders block on any non-indented, non-comment line after block started
    if [ "$in_folders" -eq 1 ] && printf '%s' "$line" | grep -qE '^[^[:space:]#]'; then
      break
    fi
    if printf '%s' "$line" | grep -qE '^\s*folders:\s*$'; then
      in_folders=1; continue
    fi
    if [ "$in_folders" -eq 1 ] && printf '%s' "$line" | grep -qE '^\s+\w+:\s+\S'; then
      local key value
      key=$(printf '%s' "$line" | sed 's/^[[:space:]]*//' | cut -d: -f1 | tr -d ' ')
      value=$(printf '%s' "$line" | sed 's/^[[:space:]]*[^:]*:[[:space:]]*//' | tr -d ' \r')
      for ck in $content_keys; do
        [ "$key" = "$ck" ] && result="${result}${value}|" && break
      done
    fi
  done < "$yml"
  printf '%s' "${result%|}"
}

folders_raw=$(read_content_folders 2>/dev/null || true)
if [ -z "$folders_raw" ]; then
  folders_raw="00-inbox|01-projects|02-areas|03-knowledge|04-resources"
fi
log "content folders: $folders_raw"

# ── Content folder filter ──────────────────────────────────────────────────────
matched=0
IFS='|' read -ra folders <<< "$folders_raw"
for folder in "${folders[@]}"; do
  [ -z "$folder" ] && continue
  if [[ "$abs_path" == "$vault_root/$folder"/* ]] || [[ "$abs_path" == "$vault_root/$folder" ]]; then
    matched=1
    break
  fi
done

if [ "$matched" -eq 0 ]; then
  log "file not in content folder, exiting"
  exit 0
fi

# ── URL-encode path ────────────────────────────────────────────────────────────
# Node.js is always available (Claude Code requires it) — use as primary encoder
encoded=$(FP="$abs_path" node -e \
  "const p=process.env.FP;process.stdout.write(encodeURIComponent(p).replace(/%2F/gi,'/').replace(/%3A/gi,':'));" \
  2>/dev/null \
  || python3 -c "import urllib.parse,sys;sys.stdout.write(urllib.parse.quote(sys.argv[1],safe='/:@'))" "$abs_path" 2>/dev/null \
  || python -c "import urllib,sys;sys.stdout.write(urllib.quote(sys.argv[1],safe='/:@'))" "$abs_path" 2>/dev/null \
  || true)

if [ -z "$encoded" ]; then
  log "URL encoding failed (node/python3/python all absent), exiting"
  exit 0
fi

uri="obsidian://open?path=${encoded}"
log "opening URI: $uri"

# ── Platform detection and open ───────────────────────────────────────────────
case "$OSTYPE" in
  darwin*)
    open "$uri"
    ;;
  linux-gnu*)
    if grep -qiE 'microsoft|wsl' /proc/sys/kernel/osrelease 2>/dev/null; then
      cmd.exe /c start "" "$uri" 2>/dev/null || \
        /mnt/c/Windows/System32/cmd.exe /c start "" "$uri" 2>/dev/null || true
    else
      xdg-open "$uri" &>/dev/null &
    fi
    ;;
  msys*|cygwin*)
    cmd.exe /c start "" "$uri"
    ;;
  *)
    log "unknown OSTYPE: $OSTYPE, exiting"
    exit 0
    ;;
esac

log "done"
exit 0
