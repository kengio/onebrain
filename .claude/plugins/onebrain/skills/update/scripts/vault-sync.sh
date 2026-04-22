#!/usr/bin/env bash
# vault-sync.sh <vault_root> <branch>
# Downloads the latest onebrain plugin files from GitHub and syncs to vault.
# Syncs the plugin folder (with stale file cleanup) and copies root docs to vault root.
# Requires: curl, tar (both included in Git for Windows / Git Bash).
# No rsync dependency — uses Python for directory sync (cross-platform).
# CWD must be vault root when calling this script (uses vault-relative path invocation).

set -euo pipefail

VAULT_ROOT="${1:?Usage: vault-sync.sh <vault_root> <branch>}"
BRANCH="${2:-main}"
REPO="kengio/onebrain"

PYTHON=$(command -v python3 2>/dev/null || command -v python 2>/dev/null) || {
  echo "ERROR: Python is required but not found. Install Python 3." >&2
  exit 1
}

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "vault-sync: downloading from github.com/${REPO}@${BRANCH}..."
# -f: exit non-zero on HTTP errors (clear error vs cryptic tar failure)
curl -fsSL "https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz" \
  | tar -xz -C "$TMP_DIR" --strip-components=1

SOURCE_PLUGIN="${TMP_DIR}/.claude/plugins/onebrain"
VAULT_PLUGIN="${VAULT_ROOT}/.claude/plugins/onebrain"

# Sync plugin folder using Python (cross-platform; no rsync required).
# Copies new/changed files, deletes stale vault files, excludes .claude-plugin/
# (plugin.json lives there — written last as completion signal).
"$PYTHON" - "$SOURCE_PLUGIN" "$VAULT_PLUGIN" ".claude-plugin" <<'PYEOF'
import sys, shutil
from pathlib import Path

src, dst, *excludes = Path(sys.argv[1]), Path(sys.argv[2]), *sys.argv[3:]
exclude_set = set(excludes)
dst.mkdir(parents=True, exist_ok=True)

def is_excluded(parts):
    return any(p in exclude_set for p in parts)

# Collect stale files first (preview)
stale = [
    rel for dst_item in dst.rglob("*")
    if dst_item.is_file()
    and not is_excluded((rel := dst_item.relative_to(dst)).parts)
    and not (src / rel).exists()
]
if stale:
    print("INFO: Removing stale vault files (not in current release):")
    for f in sorted(stale):
        print(f"  {f}")

# Copy all files from src to dst (overwrite)
for item in src.rglob("*"):
    rel = item.relative_to(src)
    if is_excluded(rel.parts):
        continue
    dst_item = dst / rel
    if item.is_dir():
        dst_item.mkdir(parents=True, exist_ok=True)
    else:
        dst_item.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, dst_item)

# Delete stale files (deepest paths first to allow empty-dir cleanup)
for dst_item in sorted(dst.rglob("*"), key=lambda p: len(p.parts), reverse=True):
    rel = dst_item.relative_to(dst)
    if is_excluded(rel.parts):
        continue
    if not (src / rel).exists():
        if dst_item.is_file():
            dst_item.unlink()
        elif dst_item.is_dir():
            try:
                dst_item.rmdir()
            except OSError:
                pass
PYEOF

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
