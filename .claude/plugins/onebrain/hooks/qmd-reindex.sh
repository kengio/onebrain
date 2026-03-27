#!/usr/bin/env bash
# qmd-reindex.sh — PostToolUse hook
# Runs `qmd update` on the vault collection after Write/Edit tool use.
# Requires qmd installed and vault.yml containing a qmd_collection key.
# Always exits 0 — never blocks Claude Code.

# No set -euo pipefail — hook script must be resilient; pipefail causes
# silent crashes on unexpected input instead of graceful no-ops.

# ── Debug logging ─────────────────────────────────────────────────────────────
LOG=""
if [ "${DEBUG:-}" = "1" ]; then
  LOG="/tmp/onebrain-qmd-debug.log"
  [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 1048576 ] && : > "$LOG"
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] qmd-reindex.sh started" >> "$LOG"
fi
log() { [ -n "$LOG" ] && echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" >> "$LOG" || true; }

# ── Check qmd is installed ─────────────────────────────────────────────────────
if ! command -v qmd &>/dev/null; then
  log "qmd not found in PATH, exiting"
  exit 0
fi

# ── Resolve vault root ─────────────────────────────────────────────────────────
vault_root="${CLAUDE_PROJECT_DIR%/}"
if [ -z "$vault_root" ]; then
  log "CLAUDE_PROJECT_DIR not set, exiting"
  exit 0
fi

# ── Read qmd_collection from vault.yml ────────────────────────────────────────
# POSIX tools only — no jq or Python required
read_qmd_collection() {
  local yml="$vault_root/vault.yml"
  [ -f "$yml" ] || return 1
  local collection=""
  while IFS= read -r line || [ -n "$line" ]; do
    # Match top-level key: qmd_collection: <value>
    if printf '%s' "$line" | grep -qE '^qmd_collection:[[:space:]]+\S'; then
      collection=$(printf '%s' "$line" | sed 's/^qmd_collection:[[:space:]]*//' | sed 's/[[:space:]]*#.*//' | tr -d ' \r"'"'"'')
      break
    fi
  done < "$yml"
  printf '%s' "$collection"
}

collection=$(read_qmd_collection 2>/dev/null) || true
if [ -z "$collection" ]; then
  log "qmd_collection not set in vault.yml, exiting"
  exit 0
fi
log "collection: $collection"

# ── Run qmd update ─────────────────────────────────────────────────────────────
log "running: qmd update -c ${collection}"
if [ -n "$LOG" ]; then
  qmd update -c "$collection" >> "$LOG" 2>&1 &
else
  qmd update -c "$collection" &>/dev/null &
fi
pid=$!
disown "$pid"
log "qmd update dispatched (pid ${pid})"

exit 0
