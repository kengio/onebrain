#!/usr/bin/env bash
# clean-plugin-cache.sh
# Removes ALL cached versions of the onebrain plugin.
# Called every /update so cache never becomes the authoritative source.
# No-op when onebrain is installed as a local directory plugin (no remote cache entry).
# Becomes active if/when onebrain is distributed through a remote marketplace.

set -euo pipefail

installed="${HOME}/.claude/plugins/installed_plugins.json"
cache_dir="${HOME}/.claude/plugins/cache"

[ -f "$installed" ] || { echo "clean-plugin-cache: installed_plugins.json not found, skipping"; exit 0; }

python_cmd=$(command -v python3 2>/dev/null || command -v python 2>/dev/null) || {
  echo "clean-plugin-cache: Python not found, skipping"
  exit 0
}

"$python_cmd" - "$cache_dir" "$installed" <<'PYEOF'
import json, sys, shutil
from pathlib import Path

cache_dir = Path(sys.argv[1])
installed_path = Path(sys.argv[2])

with open(installed_path) as f:
    try:
        data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: {installed_path} is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)

# Derive cache locations from plugin keys — not installPath (which pin-to-vault.sh may have rewritten)
# Plugin key format: onebrain@{marketplace} → cache/{marketplace}/onebrain/
onebrain_dirs = []
for plugin_key in data.get("plugins", {}):
    if not plugin_key.startswith("onebrain@"):
        continue
    marketplace = plugin_key.split("@", 1)[1]
    candidate = cache_dir / marketplace / "onebrain"
    if candidate.is_dir():
        onebrain_dirs.append(candidate)

# Fallback: glob for any cache/*/onebrain/ directory (handles unknown marketplace names)
if not onebrain_dirs and cache_dir.is_dir():
    onebrain_dirs = list(cache_dir.glob("*/onebrain"))

if not onebrain_dirs:
    print("clean-plugin-cache: no onebrain cache found, skipping")
    sys.exit(0)

removed = 0
freed_bytes = 0

for plugin_dir in onebrain_dirs:
    for version_dir in plugin_dir.iterdir():
        if not version_dir.is_dir():
            continue
        try:
            size = sum(f.stat().st_size for f in version_dir.rglob("*") if f.is_file())
            shutil.rmtree(version_dir)
            freed_bytes += size
            removed += 1
            print(f"  removed: {plugin_dir.name}/{version_dir.name}")
        except OSError as e:
            print(f"  skipped: {plugin_dir.name}/{version_dir.name} ({e})")

freed_mb = freed_bytes / (1024 * 1024)
if removed:
    print(f"clean-plugin-cache: removed {removed} version(s), freed {freed_mb:.1f} MB")
else:
    print("clean-plugin-cache: no cache versions found")
PYEOF
