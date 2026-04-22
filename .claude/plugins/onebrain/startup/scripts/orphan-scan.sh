#!/usr/bin/env bash
# orphan-scan.sh — count unmerged checkpoint sessions (orphans) at startup.
# Mirrors the orphan detection logic from wrapup/SKILL.md Step 1b so startup
# status matches what /wrapup would find. Scans current and previous month.
#
# Usage: bash orphan-scan.sh <logs_folder> <session_token>
# Output: ORPHAN_COUNT=N (KEY=VALUE format)

logs_folder="${1:-07-logs}"
current_token="${2:-99999}"
today=$(date '+%Y-%m-%d')
this_year=$(date '+%Y')
this_month=$(date '+%m')

# Previous month with year rollback
if [ "$this_month" = "01" ]; then
  prev_year=$(( this_year - 1 ))
  prev_month="12"
else
  prev_year=$this_year
  prev_month=$(printf '%02d' $(( 10#$this_month - 1 )))
fi

search_paths=(
  "${logs_folder}/${this_year}/${this_month}"
  "${logs_folder}/${prev_year}/${prev_month}"
)

seen_tokens_file=$(mktemp)
orphan_count=0

for search_path in "${search_paths[@]}"; do
  [ -d "$search_path" ] || continue

  for f in "${search_path}"/*-checkpoint-*.md; do
    [ -f "$f" ] || continue
    fname=$(basename "$f")

    # Extract date (YYYY-MM-DD prefix)
    fdate="${fname:0:10}"
    echo "$fdate" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' || continue

    # Skip today — not orphans yet
    [ "$fdate" = "$today" ] && continue

    # Extract session token (segment between date and -checkpoint-)
    ftoken=$(printf '%s' "$fname" | sed 's/^[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}-//' | sed 's/-checkpoint-.*//')
    [ -z "$ftoken" ] && continue

    # Skip current session's own checkpoints
    [ "$ftoken" = "$current_token" ] && continue

    # Skip tokens already counted
    grep -qF "$ftoken" "$seen_tokens_file" 2>/dev/null && continue

    # Skip if already merged
    grep -q '^merged: true$' "$f" 2>/dev/null && continue

    # Skip if a manually-run /wrapup log already covers this date
    # (a session log without auto-saved: true means /wrapup ran and merged the checkpoints)
    fyear="${fdate:0:4}"
    fmonth="${fdate:5:2}"
    has_manual_log=0
    for log in "${logs_folder}/${fyear}/${fmonth}/${fdate}-session-"*.md; do
      [ -f "$log" ] || continue
      # Log with auto-saved: true was written by auto-summary, not by /wrapup — still needs merge
      grep -q '^auto-saved: true$' "$log" 2>/dev/null && continue
      has_manual_log=1
      break
    done
    [ "$has_manual_log" -eq 1 ] && continue

    # Orphan confirmed
    printf '%s\n' "$ftoken" >> "$seen_tokens_file"
    orphan_count=$(( orphan_count + 1 ))
  done
done

rm -f "$seen_tokens_file"
printf 'ORPHAN_COUNT=%s\n' "$orphan_count"
