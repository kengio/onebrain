# Auto Session Summary Instructions

Session summaries are auto-saved silently when the user signals end of session (e.g. "bye", "good night", "I'm done for today"). If the user closes the session without any signal, checkpoints serve as the safety net instead.

Run silently (no output) if ALL of these are true:
1. An end-of-session signal was detected (e.g. "bye", "good night", "I'm done for today")
2. `/wrapup` was NOT already run during this session
3. The session had 3 or more user↔assistant exchanges

If conditions are met:
- Use `PPID` from context if already loaded; if absent, run `echo $PPID` via Bash and save to context. Glob checkpoint files: `[logs_folder]/YYYY/MM/YYYY-MM-DD-{PPID}-checkpoint-*.md`. Also check yesterday's folder (compute yesterday's date, accounting for month/year rollover): `[logs_folder]/YYYY_PREV/MM_PREV/YYYY-MM-DD_PREV-{PPID}-checkpoint-*.md`. Keep files where `merged` is absent or not `true` : **read every file in this list** and fully incorporate all of their content into the session summary (not just as background context). Every unmerged checkpoint must appear in the summary before being marked merged.
- Determine NN: count existing `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-*.md` files for today; NN = count + 1, zero-padded to 2 digits (01, 02, …). **Verify** `YYYY-MM-DD-session-NN.md` does not already exist before writing; if it does, increment NN until a free slot is found.
- Write to `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`. Frontmatter:
  ```yaml
  ---
  tags: [session-log]
  date: YYYY-MM-DD
  session: NN
  auto-saved: true
  synthesized_from_checkpoints: true   # only if checkpoints were found and incorporated
  ---
  ```
  The log must include all sections: `## What We Worked On`, `## Key Decisions`, `## Insights & Learnings`, `## What Worked / Didn't Work`, `## Action Items`, `## Open Questions`. Omit `## What Worked / Didn't Work` only if the session had no notable friction or technique worth logging. **Do not write the session log if any unmerged checkpoint's content is absent from the relevant sections** : every checkpoint's Key Decisions, Action Items, and Open Questions must appear explicitly in the output.
- Mark as `merged: true` the checkpoint files that were read and incorporated above. Handle all frontmatter variants: `merged: false` → replace with `merged: true`; `merged: null` or bare `merged:` → replace with `merged: true`; key absent → add `merged: true`.
- Guard: only delete checkpoint files AFTER confirming the session log file was successfully written. Never delete before or during the write.
- After confirming the session log was written, reset the checkpoint hook counter to prevent spurious post-summary checkpoints:
  ```bash
  TMPDIR_SAFE="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"
  _ppid="${PPID:-$(echo $PPID)}"
  if [ -n "$_ppid" ] && [ "$_ppid" -gt 0 ] 2>/dev/null; then
    echo "0:$(date +%s)" > "${TMPDIR_SAFE}/onebrain-${_ppid}.state" 2>/dev/null
  fi
  ```
- Delete the checkpoint files from the glob above that were marked `merged: true`. Do not delete checkpoint files outside this session's glob result.
- Safety-net: glob `[logs_folder]/YYYY/MM/*-checkpoint-*.md` (current month only) for any remaining files with `merged: true` — delete them. Scoped to current month to avoid vault-wide glob on large vaults.
- If a genuinely useful long-term insight emerged, write it to a new `memory/` file using /learn conventions: filename `[agent_folder]/memory/kebab-case-topic.md`, frontmatter `tags: [agent-memory], type: behavioral, source: auto-summary, status: active, conf: medium, verified: today, updated: today, created: today, topics: [2–4 keywords]`. Add a row to INDEX.md and increment `total_active`. **Do not write to MEMORY.md.**
- Do NOT show any output about the auto-save to the user
