#!/usr/bin/env bash
# Outputs datetime and session token for startup Step 1.
# Runs in parallel with vault.yml and MEMORY.md reads.
# Output: KEY=VALUE lines read by Claude to populate context variables.
#
# Usage: bash session-init.sh
# Output variables: DATETIME, SESSION_TOKEN

# --- Datetime ---
printf 'DATETIME=%s\n' "$(date '+%a · %d %b %Y · %H:%M')"

# --- Session token ---
# Priority: WT_SESSION (Windows Terminal) → PPID (Mac/Linux) → PowerShell parent PID → day-scoped cache
_tmpdir="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"

if [ -n "${WT_SESSION:-}" ]; then
  _token=$(printf '%s' "$WT_SESSION" | tr -cd 'a-zA-Z0-9' | cut -c1-8)
elif [ -n "${PPID:-}" ] && [ "${PPID}" -gt 1 ] 2>/dev/null; then
  _token="${PPID}"
elif command -v powershell.exe &>/dev/null; then
  _token=$(powershell.exe -NoProfile -NonInteractive -Command '(Get-Process -Id $PID).Parent.Id' 2>/dev/null | tr -d '\r\n ')
else
  _f="${_tmpdir}/ob1-$(date +%Y-%m-%d).sid"
  [ -f "$_f" ] || printf '%05d' "$(( RANDOM % 90000 + 10000 ))" > "$_f" 2>/dev/null
  _token=$(cat "$_f" 2>/dev/null || echo '99999')
fi

printf 'SESSION_TOKEN=%s\n' "${_token:-99999}"
