#!/usr/bin/env bash
# open-in-obsidian.sh — opens a vault file in the Obsidian app.
# Skills call this after writing a file (TASKS.md, MOC.md, etc.) instead of
# constructing the obsidian:// URI inline.
# Exits silently if Obsidian is not installed or the open command fails.
#
# Usage: bash ".claude/plugins/onebrain/startup/scripts/open-in-obsidian.sh" <relative-path>
# Example: bash "...open-in-obsidian.sh" "TASKS.md"

[ -z "$1" ] && exit 1

uname_s="$(uname -s 2>/dev/null)"

# On MINGW/CYGWIN/MSYS, `pwd` returns a POSIX path like `/c/Users/...` which
# Windows Obsidian rejects. `cygpath -m` returns the mixed form `C:/Users/...`,
# which the Obsidian URI handler accepts. See issue #130.
case "$uname_s" in
  MINGW*|CYGWIN*|MSYS*)
    if command -v cygpath >/dev/null 2>&1; then
      vault_path=$(cygpath -m "${CLAUDE_PROJECT_DIR:-.}")
    else
      vault_path=$(cd "${CLAUDE_PROJECT_DIR:-.}" && pwd)
    fi
    ;;
  *)
    vault_path=$(cd "${CLAUDE_PROJECT_DIR:-.}" && pwd)
    ;;
esac

# URL-encode via Node — handles UTF-8 (CJK / accented vault names) correctly.
# A bash byte-loop encoder would either drop continuation bytes (UTF-8 locale)
# or sign-extend them to 16-hex (C locale); see #130 round-1 review. Node is
# guaranteed present because OneBrain's CLI requires it.
_node_encode() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' -- "$1" 2>/dev/null
}

encoded_vault="$(_node_encode "$vault_path")"
encoded_file="$(_node_encode "$1")"

# If Node is missing, abort loudly. Falling back to a raw, un-encoded URI
# would silently truncate the vault path at the first `&`/`?`/`#`/space and
# launch Obsidian against the wrong vault — exactly the silent-failure mode
# the encoder exists to prevent (#130).
if [ -z "$encoded_vault" ] || [ -z "$encoded_file" ]; then
  printf 'open-in-obsidian: node required for URI encoding; aborting launch\n' >&2
  exit 1
fi

# encodeURIComponent escapes the path separators (`/` → `%2F`); Obsidian's URI
# handler decodes them back. The vault path and the file path are joined with
# a literal `/` between the two encoded segments — Obsidian then sees a
# correctly-formed `path=` value after URL decoding.
uri="obsidian://open?path=${encoded_vault}%2F${encoded_file}"

case "$uname_s" in
  Darwin)             open "$uri" 2>/dev/null || true ;;
  Linux)              xdg-open "$uri" 2>/dev/null || true ;;
  CYGWIN*|MINGW*|MSYS*) cmd.exe /c start "" "$uri" 2>/dev/null || true ;;
  *)                  open "$uri" 2>/dev/null || true ;;
esac
