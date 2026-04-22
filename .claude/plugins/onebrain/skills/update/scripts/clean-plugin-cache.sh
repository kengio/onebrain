#!/usr/bin/env bash
# clean-plugin-cache.sh
# Removes old cached versions of the onebrain plugin, keeping only the active version.
# No-op when onebrain is installed as a local directory plugin (no remote cache entry).
# Becomes active if/when onebrain is distributed through a remote marketplace.

set -euo pipefail

INSTALLED="${HOME}/.claude/plugins/installed_plugins.json"
CACHE_DIR="${HOME}/.claude/plugins/cache"

[ -f "$INSTALLED" ] || { echo "clean-plugin-cache: installed_plugins.json not found, skipping"; exit 0; }

python3 - "$CACHE_DIR" "$INSTALLED" <<'PYEOF'
import json, sys, shutil
from pathlib import Path

cache_dir = Path(sys.argv[1])
installed_path = Path(sys.argv[2])

with open(installed_path) as f:
    data = json.load(f)

# Find onebrain entry (any marketplace key starting with "onebrain@")
active_version = None
active_plugin_dir = None

for plugin_key, entries in data.get("plugins", {}).items():
    if not plugin_key.startswith("onebrain@"):
        continue
    if not isinstance(entries, list):
        continue
    for entry in entries:
        install_path = entry.get("installPath", "")
        if install_path:
            p = Path(install_path)
            active_plugin_dir = p.parent
            active_version = p.name
            break

if not active_version:
    print("clean-plugin-cache: onebrain not in remote cache (local directory install), skipping")
    exit(0)

# If install path is not inside the Claude cache directory, it's a local install
# Use is_relative_to (Python 3.9+) to avoid false positives from startswith on similar dir names
try:
    active_plugin_dir.relative_to(cache_dir)
except ValueError:
    print("clean-plugin-cache: onebrain is a local directory install, no remote cache to clean")
    exit(0)

if not active_plugin_dir.is_dir():
    print("clean-plugin-cache: onebrain cache dir not found, skipping")
    exit(0)

removed = 0
freed_bytes = 0

for version_dir in active_plugin_dir.iterdir():
    if version_dir.is_dir() and version_dir.name != active_version:
        size = sum(f.stat().st_size for f in version_dir.rglob("*") if f.is_file())
        shutil.rmtree(version_dir)
        freed_bytes += size
        removed += 1
        print(f"  removed: onebrain/{version_dir.name}")

freed_mb = freed_bytes / (1024 * 1024)
if removed:
    print(f"clean-plugin-cache: removed {removed} stale version(s), freed {freed_mb:.1f} MB")
else:
    print(f"clean-plugin-cache: onebrain/{active_version} is the only version, nothing to remove")
PYEOF
