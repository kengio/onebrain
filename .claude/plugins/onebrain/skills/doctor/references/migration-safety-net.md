# Migration Safety Net — Reference

Check at end of every `/doctor` run.

If `05-agent/context/` still exists:
→ warn: "context/ folder found — /update migration may not have run yet"
→ AskUserQuestion: "Migrate all files into memory/?" `migrate / skip`
→ This check catches edge cases only — the full migration runs via /update
