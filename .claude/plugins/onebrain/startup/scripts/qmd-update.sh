#!/usr/bin/env bash
# qmd-update.sh — runs qmd index update using the collection declared in vault.yml.
# Skills call this after writing vault files instead of constructing the qmd command inline.
# Exits silently if qmd is not installed or qmd_collection is not set.
#
# Usage: bash ".claude/plugins/onebrain/startup/scripts/qmd-update.sh"
# Run from vault root (CLAUDE_PROJECT_DIR or cwd).

command -v qmd >/dev/null 2>&1 || exit 0

# Robust collection parser — same logic as qmd-reindex.sh (handles comments, whitespace, quotes)
vault_yml="${CLAUDE_PROJECT_DIR:-.}/vault.yml"
[ -f "$vault_yml" ] || exit 0
collection=""
while IFS= read -r line || [ -n "$line" ]; do
  if printf '%s' "$line" | grep -qE '^qmd_collection:[[:space:]]+\S'; then
    collection=$(printf '%s' "$line" | sed 's/^qmd_collection:[[:space:]]*//' | sed 's/[[:space:]]*#.*//' | tr -d ' \r"'"'"'')
    break
  fi
done < "$vault_yml"
[ -z "$collection" ] && exit 0

qmd update -c "$collection"
