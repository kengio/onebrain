#!/usr/bin/env bash
# backfill-recapped.sh <logs_folder>
# Adds recapped: <date> to session logs that don't have it.
# Used once during migration — idempotent (skips files already having recapped:).

set -euo pipefail

LOGS="${1:?Usage: backfill-recapped.sh <logs_folder>}"

if [ ! -d "$LOGS" ]; then
  echo "backfill-recapped: no logs folder, skipping"
  exit 0
fi

count=0
while IFS= read -r -d '' file; do
    grep -q "^recapped:" "$file" 2>/dev/null && continue

    date_val=$(grep "^date:" "$file" 2>/dev/null | head -1 | sed 's/date:[[:space:]]*//')
    [ -z "$date_val" ] && date_val=$(basename "$file" | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2}' || true)
    [ -z "$date_val" ] && continue

    # Insert recapped: after the date: line (portable: avoid sed -i '' macOS-only syntax)
    if grep -q "^date:" "$file"; then
        tmp=$(mktemp)
        sed "/^date:/a\\
recapped: ${date_val}" "$file" > "$tmp" && mv "$tmp" "$file"
        count=$((count + 1))
    fi
done < <(find "$LOGS" -name "*-session-*.md" -print0 2>/dev/null)

echo "backfill-recapped: ${count} files updated"
