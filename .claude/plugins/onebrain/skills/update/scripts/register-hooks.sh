#!/usr/bin/env bash
# register-hooks.sh <vault_settings_json> [--qmd | --remove-qmd]
# Idempotently registers OneBrain Stop/PreCompact/PostCompact hooks.
# Pass --qmd to also register the PostToolUse qmd-reindex hook.
# Pass --remove-qmd to remove the PostToolUse qmd-reindex hook.
# Safe: never replaces user-added hooks in the same event key.
# Must be run with CWD = vault root (path argument is relative to vault root).

set -euo pipefail

settings="${1:?Usage: register-hooks.sh <vault_settings_json> [--qmd | --remove-qmd]}"
with_qmd=0
remove_qmd=0
[[ "${2:-}" == "--qmd" ]] && with_qmd=1
[[ "${2:-}" == "--remove-qmd" ]] && remove_qmd=1

if [ ! -f "$settings" ]; then
  echo "ERROR: settings file not found: $settings" >&2
  exit 1
fi

python_cmd=$(command -v python3 2>/dev/null || command -v python 2>/dev/null) || {
  echo "ERROR: Python is required but not found." >&2
  exit 1
}

"$python_cmd" - "$settings" "$with_qmd" "$remove_qmd" <<'PYEOF'
import json, sys

path = sys.argv[1]
with_qmd = len(sys.argv) > 2 and sys.argv[2] == "1"
remove_qmd = len(sys.argv) > 3 and sys.argv[3] == "1"

with open(path) as f:
    try:
        cfg = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: {path} is not valid JSON: {e}", file=sys.stderr)
        sys.exit(1)

hooks = cfg.setdefault("hooks", {})

if remove_qmd:
    entries = hooks.get("PostToolUse", [])
    before = len(entries)
    hooks["PostToolUse"] = [
        e for e in entries
        if not any("qmd-reindex" in h.get("command", "") for h in e.get("hooks", []))
    ]
    if not hooks["PostToolUse"]:
        del hooks["PostToolUse"]
    with open(path, "w") as f:
        json.dump(cfg, f, indent=4)
    removed = before - len(hooks.get("PostToolUse", []))
    print("register-hooks: removed PostToolUse qmd hook" if removed else "register-hooks: PostToolUse qmd hook not found")
    sys.exit(0)

hooks_to_register = {
    "Stop":        'onebrain checkpoint stop',
    "PreCompact":  'onebrain checkpoint precompact',
    "PostCompact": 'onebrain checkpoint postcompact',
}

if with_qmd:
    hooks_to_register["PostToolUse"] = 'onebrain qmd-reindex'

registered = []

for event, cmd in hooks_to_register.items():
    entries = hooks.setdefault(event, [])
    marker = "qmd-reindex" if event == "PostToolUse" else "checkpoint"
    expected_matcher = "Write|Edit" if event == "PostToolUse" else ""
    found = False
    for entry in entries:
        for h in entry.get("hooks", []):
            if marker in h.get("command", ""):
                if h["command"] != cmd:
                    h["command"] = cmd
                if entry.get("matcher", "") != expected_matcher:
                    entry["matcher"] = expected_matcher
                found = True
    if not found:
        entries.append({"matcher": expected_matcher, "hooks": [{"type": "command", "command": cmd}]})
        registered.append(event)

with open(path, "w") as f:
    json.dump(cfg, f, indent=4)

if registered:
    print(f"register-hooks: added {', '.join(registered)}")
else:
    print("register-hooks: all hooks already registered")
PYEOF
