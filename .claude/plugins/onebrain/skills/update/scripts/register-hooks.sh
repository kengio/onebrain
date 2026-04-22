#!/usr/bin/env bash
# register-hooks.sh <vault_settings_json>
# Idempotently registers OneBrain Stop/PreCompact/PostCompact hooks.
# Safe: never replaces user-added hooks in the same event key.
# Must be run with CWD = vault root (path argument is relative to vault root).

set -euo pipefail

SETTINGS="${1:?Usage: register-hooks.sh <vault_settings_json>}"

if [ ! -f "$SETTINGS" ]; then
  echo "ERROR: settings file not found: $SETTINGS" >&2
  exit 1
fi

python3 - "$SETTINGS" <<'PYEOF'
import json, sys

path = sys.argv[1]
with open(path) as f:
    try:
        cfg = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: {path} is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)

hooks_to_register = {
    "Stop":        'bash ".claude/plugins/onebrain/hooks/checkpoint-hook.sh" stop',
    "PreCompact":  'bash ".claude/plugins/onebrain/hooks/checkpoint-hook.sh" precompact',
    "PostCompact": 'bash ".claude/plugins/onebrain/hooks/checkpoint-hook.sh" postcompact',
}

hooks = cfg.setdefault("hooks", {})
registered = []

for event, cmd in hooks_to_register.items():
    entries = hooks.setdefault(event, [])
    found = False
    for entry in entries:
        for h in entry.get("hooks", []):
            if "checkpoint-hook.sh" in h.get("command", ""):
                if h["command"] != cmd:
                    h["command"] = cmd
                found = True
    if not found:
        entries.append({"matcher": "", "hooks": [{"type": "command", "command": cmd}]})
        registered.append(event)

with open(path, "w") as f:
    json.dump(cfg, f, indent=4)

if registered:
    print(f"register-hooks: added {', '.join(registered)}")
else:
    print("register-hooks: all hooks already registered")
PYEOF
