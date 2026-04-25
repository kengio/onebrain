#!/usr/bin/env bash
# Resets the checkpoint hook counter after /wrapup writes the session log.
# Writes "0:<epoch>" to the session state file, triggering a 60-second skip
# window so the Stop hook does not fire a spurious checkpoint immediately after
# wrapup completes.

tmpdir_safe="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"

if [ -n "${WT_SESSION:-}" ]; then
  _token=$(printf '%s' "$WT_SESSION" | tr -cd 'a-zA-Z0-9' | cut -c1-8)
elif [ -n "${PPID:-}" ] && [ "${PPID}" -gt 1 ] 2>/dev/null; then
  _token="${PPID}"
elif command -v powershell.exe &>/dev/null; then
  _token=$(powershell.exe -NoProfile -NonInteractive -Command '(Get-Process -Id $PID).Parent.Id' 2>/dev/null | tr -d '\r\n ')
else
  _f="${tmpdir_safe}/ob1-$(date +%Y-%m-%d).sid"
  [ -f "$_f" ] || printf '%05d' "$(( RANDOM % 90000 + 10000 ))" > "$_f" 2>/dev/null
  _token=$(cat "$_f" 2>/dev/null || echo '99999')
fi

[ -n "${_token:-}" ] && echo "0:$(date +%s):00" > "${tmpdir_safe}/onebrain-${_token}.state" 2>/dev/null
