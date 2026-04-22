#!/usr/bin/env bash
# vault-sync.sh <source_repo> <vault_root>
# Syncs plugin folder from source repo to vault (with stale file cleanup)
# and copies root docs (README, CONTRIBUTING, CHANGELOG) to vault root.
# Must be run with CWD = vault root (called via vault-relative path after bootstrap step 1).

set -euo pipefail

SOURCE_REPO="${1:?Usage: vault-sync.sh <source_repo> <vault_root>}"
VAULT_ROOT="${2:?Usage: vault-sync.sh <source_repo> <vault_root>}"

SOURCE_PLUGIN="${SOURCE_REPO}/.claude/plugins/onebrain"
VAULT_PLUGIN="${VAULT_ROOT}/.claude/plugins/onebrain"

if [ ! -d "$SOURCE_PLUGIN" ]; then
  echo "ERROR: source plugin folder not found: $SOURCE_PLUGIN" >&2
  exit 1
fi

mkdir -p "$VAULT_PLUGIN"

# Warn about files that will be deleted (stale files in vault not in source repo).
# Output is captured by the agent and surfaced in the migration log.
deleted=$(rsync -a --delete --dry-run \
  --exclude='.claude-plugin/' \
  "${SOURCE_PLUGIN}/" "${VAULT_PLUGIN}/" \
  | grep "^deleting " | grep -v "/$" || true)
if [ -n "$deleted" ]; then
  echo "INFO: Removing stale vault files (not in source repo):"
  echo "$deleted"
fi

# Sync plugin folder: copy new/changed files, delete files removed from source.
# Excludes .claude-plugin/ (contains plugin.json — written last as completion signal).
rsync -a --delete \
  --exclude='.claude-plugin/' \
  "${SOURCE_PLUGIN}/" "${VAULT_PLUGIN}/"

echo "synced: .claude/plugins/onebrain/"

# Copy root docs to vault root
synced_root=0
for f in README.md CONTRIBUTING.md CHANGELOG.md; do
  if [ -f "${SOURCE_REPO}/${f}" ]; then
    cp "${SOURCE_REPO}/${f}" "${VAULT_ROOT}/${f}"
    echo "synced: ${f}"
    synced_root=$((synced_root + 1))
  fi
done

echo "vault-sync: done (${synced_root} root files synced)"
