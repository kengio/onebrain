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
import json, os, sys, tempfile
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

# Find ALL onebrain entries (supports legacy dual-key: onebrain@onebrain-local + onebrain@onebrain)
onebrain_keys = [k for k in data.get("plugins", {}) if k.startswith("onebrain@")]

if not onebrain_keys:
    print("pin-to-vault: onebrain not found in installed_plugins.json, skipping")
    sys.exit(0)

# Check vault plugin dir exists
if not Path(vault_dir).exists():
    print("pin-to-vault: vault plugin dir not found, skipping")
    sys.exit(0)

cache_dir = Path(plugins_path).parent / "cache"  # installed_plugins.json → plugins/ → cache/
changed = False

# Read version from vault plugin.json once before iterating entries
vault_version = "unknown"
try:
    with open(vault_pjson) as f:
        pjson = json.load(f)
    vault_version = pjson.get("version", "unknown")
except FileNotFoundError:
    pass  # plugin.json not yet written — acceptable during initial sync
except json.JSONDecodeError as e:
    print(f"WARNING: {vault_pjson} is not valid JSON: {e} — version will be set to 'unknown'", file=sys.stderr)

for onebrain_key in onebrain_keys:
    for entry in data["plugins"][onebrain_key]:
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
    # Atomic write: write to temp file first, then rename — prevents corruption on mid-write failure
    dir_ = Path(plugins_path).parent
    fd, tmp_path = tempfile.mkstemp(dir=dir_, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=4)
        os.replace(tmp_path, plugins_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    print(f"pin-to-vault: pinned to vault ({vault_dir})")
else:
    print("pin-to-vault: already vault-level, no change needed")
PYEOF
