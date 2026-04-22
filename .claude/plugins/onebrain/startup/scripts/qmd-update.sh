#!/usr/bin/env bash
# qmd-update.sh — runs qmd index update using the collection declared in vault.yml.
# Skills call this after writing vault files instead of constructing the qmd command inline.
# Exits silently if qmd is not installed or qmd_collection is not set.
#
# Usage: bash ".claude/plugins/onebrain/startup/scripts/qmd-update.sh"
# Run from vault root (CLAUDE_PROJECT_DIR or cwd).

collection=$(grep '^qmd_collection:' "${CLAUDE_PROJECT_DIR:-.}/vault.yml" 2>/dev/null | awk '{print $2}')
[ -z "$collection" ] && exit 0
command -v qmd >/dev/null 2>&1 || exit 0
qmd update -c "$collection"
