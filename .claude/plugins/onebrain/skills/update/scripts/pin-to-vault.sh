#!/usr/bin/env bash
# pin-to-vault.sh <vault_root>
# Pins the onebrain entry in installed_plugins.json to the vault plugin directory.
# If installPath is inside ~/.claude/plugins/cache/, it is updated to point at
# {vault_root}/.claude/plugins/onebrain so Claude Code loads from vault, not cache.
# Must be run with CWD = vault root (or pass vault root as argument).

set -euo pipefail

vault_root="${1:?Usage: pin-to-vault.sh <vault_root>}"

installed_plugins_json="$HOME/.claude/plugins/installed_plugins.json"
vault_plugin_dir="${vault_root}/.claude/plugins/onebrain"
vault_plugin_json="${vault_plugin_dir}/.claude-plugin/plugin.json"

python_cmd=$(command -v python3 2>/dev/null || command -v python 2>/dev/null) || {
  echo "ERROR: Python is required but not found." >&2
  exit 1
}

"$python_cmd" - "$installed_plugins_json" "$vault_plugin_dir" "$vault_plugin_json" <<'PYEOF'
import json, sys
from pathlib import Path

plugins_path   = sys.argv[1]
vault_dir      = sys.argv[2]
vault_pjson    = sys.argv[3]

# Check installed_plugins.json exists
if not Path(plugins_path).exists():
    print("pin-to-vault: installed_plugins.json not found, skipping")
    sys.exit(0)

with open(plugins_path) as f:
    try:
        data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: {plugins_path} is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)

# Find onebrain entry (key starting with onebrain@)
onebrain_key = None
for key in data.get("plugins", {}):
    if key.startswith("onebrain@"):
        onebrain_key = key
        break

if onebrain_key is None:
    print("pin-to-vault: onebrain not found in installed_plugins.json, skipping")
    sys.exit(0)

# Check vault plugin dir exists
if not Path(vault_dir).exists():
    print("pin-to-vault: vault plugin dir not found, skipping")
    sys.exit(0)

entries = data["plugins"][onebrain_key]
cache_dir = Path(plugins_path).parent / "cache"  # installed_plugins.json → plugins/ → cache/
changed = False

# Read version from vault plugin.json once before iterating entries
vault_version = "unknown"
try:
    with open(vault_pjson) as f:
        pjson = json.load(f)
    vault_version = pjson.get("version", "unknown")
except (FileNotFoundError, json.JSONDecodeError):
    pass

for entry in entries:
    if not entry.get("installPath"):
        continue

    install_path = Path(entry["installPath"])
    # Use Path.relative_to() to detect if path is inside cache — avoids
    # false positives on similarly-named directories (e.g. ~/.claude/plugins/cache-backup/)
    try:
        install_path.relative_to(cache_dir)
        in_cache = True
    except ValueError:
        in_cache = False

    if not in_cache:
        continue

    entry["installPath"] = vault_dir
    entry["version"] = vault_version
    changed = True

if changed:
    with open(plugins_path, "w") as f:
        json.dump(data, f, indent=4)
    print(f"pin-to-vault: pinned to vault ({vault_dir})")
else:
    print("pin-to-vault: already vault-level, no change needed")
PYEOF
