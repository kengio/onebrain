#!/usr/bin/env bash
# vault-sync.sh <vault_root> <branch>
# Downloads the latest onebrain plugin files from GitHub and syncs to vault.
# After download, three sync operations run in parallel:
#   - Plugin folder sync (with stale file cleanup)
#   - Root docs copy (README, CONTRIBUTING, CHANGELOG)
#   - Harness file merge (CLAUDE.md, GEMINI.md, AGENTS.md) — vault is primary
# Then sequentially (must follow sync_plugin):
#   - pin-to-vault.sh (reads plugin.json written by sync_plugin)
# Requires: curl, tar (both included in Git for Windows / Git Bash).
# No rsync dependency — uses Python 3.7+ for all sync operations (cross-platform).
# CWD must be vault root when calling this script (uses vault-relative path invocation).

set -euo pipefail

vault_root="${1:?Usage: vault-sync.sh <vault_root> <branch>}"
branch="${2:-main}"
repo="kengio/onebrain"

python_cmd=$(command -v python3 2>/dev/null || command -v python 2>/dev/null) || {
  echo "ERROR: Python is required but not found. Install Python 3." >&2
  exit 1
}

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

echo "vault-sync: downloading from github.com/${repo}@${branch}..."
# -f: exit non-zero on HTTP errors (clear error vs cryptic tar failure)
curl -fsSL "https://github.com/${repo}/archive/refs/heads/${branch}.tar.gz" \
  | tar -xz -C "$tmp_dir" --strip-components=1

# All three sync operations are independent — run them in parallel.
"$python_cmd" - "$tmp_dir" "$vault_root" <<'PYEOF'
import sys, shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

tmp_dir = Path(sys.argv[1])
vault_root = Path(sys.argv[2])

source_plugin = tmp_dir / ".claude" / "plugins" / "onebrain"
vault_plugin = vault_root / ".claude" / "plugins" / "onebrain"
exclude_dirs = {".claude-plugin"}

# ── helpers ──────────────────────────────────────────────────────────────────

def is_excluded(parts):
    return any(p in exclude_dirs for p in parts)

# ── task 1: plugin folder sync ───────────────────────────────────────────────

def sync_plugin():
    vault_plugin.mkdir(parents=True, exist_ok=True)

    # Identify stale files (preview before deletion)
    stale = []
    for dst_item in vault_plugin.rglob("*"):
        if not dst_item.is_file():
            continue
        rel = dst_item.relative_to(vault_plugin)
        if not is_excluded(rel.parts) and not (source_plugin / rel).exists():
            stale.append(rel)

    if stale:
        print("INFO: Removing stale vault files (not in current release):\n" +
              "\n".join(f"  {f}" for f in sorted(stale)))

    # Copy files in parallel
    def copy_one(item):
        rel = item.relative_to(source_plugin)
        if is_excluded(rel.parts):
            return
        dst = vault_plugin / rel
        if item.is_dir():
            dst.mkdir(parents=True, exist_ok=True)
        else:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dst)

    items = list(source_plugin.rglob("*"))
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(copy_one, items))

    # Delete stale files (deepest first to allow empty-dir cleanup)
    for dst_item in sorted(vault_plugin.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        rel = dst_item.relative_to(vault_plugin)
        if is_excluded(rel.parts):
            continue
        if not (source_plugin / rel).exists():
            if dst_item.is_file():
                dst_item.unlink()
            elif dst_item.is_dir():
                try:
                    dst_item.rmdir()
                except OSError:
                    pass

    print("synced: .claude/plugins/onebrain/")

# ── task 2: root docs copy (overwrite) ───────────────────────────────────────

def copy_root_docs():
    copied = 0
    for fname in ("README.md", "CONTRIBUTING.md", "CHANGELOG.md"):
        src = tmp_dir / fname
        if src.exists():
            shutil.copy2(src, vault_root / fname)
            print(f"synced: {fname}")
            copied += 1
    return copied

# ── task 3: harness file merge (vault is primary) ────────────────────────────

def merge_harness_file(fname):
    src = tmp_dir / fname
    dst = vault_root / fname

    if not src.exists():
        return

    repo_text = src.read_text(encoding="utf-8-sig")

    if not dst.exists():
        dst.write_text(repo_text, encoding="utf-8")
        print(f"created: {fname}")
        return

    vault_text = dst.read_text(encoding="utf-8-sig")

    if vault_text == repo_text:
        print(f"up-to-date: {fname}")
        return

    # Vault is primary. Find @ imports in repo not yet present in vault.
    vault_lines = vault_text.splitlines()
    vault_at_set = {l.strip() for l in vault_lines if l.startswith("@")}
    new_imports = [
        line.rstrip() for line in repo_text.splitlines()
        if line.startswith("@") and line.strip() not in vault_at_set
    ]

    if not new_imports:
        print(f"kept: {fname} (vault version retained, no new imports to inject)")
        return

    # Insert before the last @ line (keeps @INSTRUCTIONS.md last)
    last_at = max((i for i, l in enumerate(vault_lines) if l.startswith("@")), default=-1)
    if last_at >= 0:
        vault_lines[last_at:last_at] = new_imports
    else:
        vault_lines += [""] + new_imports

    dst.write_text("\n".join(vault_lines) + "\n", encoding="utf-8")
    print(f"merged: {fname} (injected {len(new_imports)} new import(s) from repo)")

def merge_harness_files():
    with ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(merge_harness_file, ("CLAUDE.md", "GEMINI.md", "AGENTS.md")))

# ── task 4: pin-to-vault.sh ──────────────────────────────────────────────────

def pin_vault():
    import subprocess, os
    script = vault_root / ".claude/plugins/onebrain/skills/update/scripts/pin-to-vault.sh"
    if not script.exists():
        print("pin-to-vault: script not found, skipping")
        return
    result = subprocess.run(
        ["bash", str(script), str(vault_root)],
        capture_output=True, text=True, cwd=str(vault_root)
    )
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"pin-to-vault.sh exited {result.returncode}")
    elif result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)

# ── run first three tasks in parallel, then pin_vault sequentially ───────────

with ThreadPoolExecutor(max_workers=3) as pool:
    futures = {
        pool.submit(sync_plugin): "plugin sync",
        pool.submit(copy_root_docs): "root docs",
        pool.submit(merge_harness_files): "harness merge",
    }
    for future in as_completed(futures):
        exc = future.exception()
        if exc:
            raise RuntimeError(f"{futures[future]} failed: {exc}") from exc

# pin_vault reads plugin.json written by sync_plugin — must run after parallel block
pin_vault()

print("vault-sync: done")
PYEOF
