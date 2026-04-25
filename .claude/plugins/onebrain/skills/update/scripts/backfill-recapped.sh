#!/usr/bin/env bash
# backfill-recapped.sh <logs_folder> [cutoff_date]
# Adds recapped: <date> to session logs that don't have it.
# cutoff_date (YYYY-MM-DD): only mark logs on or before this date.
# If absent, marks all logs (initial migration scenario).
# Idempotent — skips files already having recapped:.

set -euo pipefail

logs="${1:?Usage: backfill-recapped.sh <logs_folder> [cutoff_date]}"
cutoff="${2:-}"

if [ ! -d "$logs" ]; then
  echo "backfill-recapped: no logs folder, skipping"
  exit 0
fi

count=0
while IFS= read -r -d '' file; do
    grep -q "^recapped:" "$file" 2>/dev/null && continue

    date_val=$(grep "^date:" "$file" 2>/dev/null | head -1 | sed 's/date:[[:space:]]*//' | tr -d '\r\n')
    [ -z "$date_val" ] && date_val=$(basename "$file" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)
    [ -z "$date_val" ] && continue

    # Skip logs newer than cutoff (string comparison works for YYYY-MM-DD)
    [ -n "$cutoff" ] && [[ "$date_val" > "$cutoff" ]] && continue

    # Insert recapped: after the date: line (awk: portable across BSD/GNU; no blank-line issue)
    if grep -q "^date:" "$file"; then
        tmp=$(mktemp)
        awk -v recap="recapped: ${date_val}" '/^date:/{print; print recap; next}1' "$file" > "$tmp" && mv "$tmp" "$file"
        count=$((count + 1))
    fi
done < <(find "$logs" -name "*-session-*.md" -print0 2>/dev/null)

echo "backfill-recapped: ${count} files updated"
