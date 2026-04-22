#!/usr/bin/env bash
# open-in-obsidian.sh — opens a vault file in the Obsidian app.
# Skills call this after writing a file (TASKS.md, MOC.md, etc.) instead of
# constructing the obsidian:// URI inline.
# Exits silently if Obsidian is not installed or the open command fails.
#
# Usage: bash ".claude/plugins/onebrain/startup/scripts/open-in-obsidian.sh" <relative-path>
# Example: bash "...open-in-obsidian.sh" "TASKS.md"

[ -z "$1" ] && exit 1
vault_path=$(cd "${CLAUDE_PROJECT_DIR:-.}" && pwd)
open "obsidian://open?path=${vault_path}/${1}" 2>/dev/null || true
