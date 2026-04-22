#!/usr/bin/env bash
# vault-sync.sh <vault_root> <branch>
# Downloads the latest onebrain plugin files from GitHub and syncs to vault.
# Syncs the plugin folder (with stale file cleanup) and copies root docs to vault root.
# Must be run with CWD = vault root (called via vault-relative path after bootstrap step 1).

set -euo pipefail

VAULT_ROOT="${1:?Usage: vault-sync.sh <vault_root> <branch>}"
BRANCH="${2:-main}"
REPO="kengio/onebrain"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "vault-sync: downloading from github.com/${REPO}@${BRANCH}..."
curl -sL "https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz" \
  | tar -xz -C "$TMP_DIR" --strip-components=1

SOURCE_PLUGIN="${TMP_DIR}/.claude/plugins/onebrain"
VAULT_PLUGIN="${VAULT_ROOT}/.claude/plugins/onebrain"

# Warn about files that will be deleted (stale files in vault not in source).
deleted=$(rsync -a --delete --dry-run \
  --exclude='.claude-plugin/' \
  "${SOURCE_PLUGIN}/" "${VAULT_PLUGIN}/" \
  | grep "^deleting " | grep -v "/$" || true)
if [ -n "$deleted" ]; then
  echo "INFO: Removing stale vault files (not in current release):"
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
  if [ -f "${TMP_DIR}/${f}" ]; then
    cp "${TMP_DIR}/${f}" "${VAULT_ROOT}/${f}"
    echo "synced: ${f}"
    synced_root=$((synced_root + 1))
  fi
done

echo "vault-sync: done (${synced_root} root files synced)"
