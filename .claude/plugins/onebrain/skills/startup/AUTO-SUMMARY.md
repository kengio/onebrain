# Auto Session Summary Instructions

Session summaries are auto-saved silently when the user signals end of session (e.g. "bye", "good night", "I'm done for today"). If the user closes the session without any signal, checkpoints serve as the safety net instead.

Run silently (no output) if ALL of these are true:
1. An end-of-session signal was detected (e.g. "bye", "good night", "I'm done for today")
2. `/wrapup` was NOT already run during this session
3. The session had 3 or more user↔assistant exchanges

If conditions are met:
- Use `session_token` from context if already loaded (set by `onebrain session-init` at startup); if absent, run `onebrain session-init` and use the `SESSION_TOKEN` value. Glob checkpoint files: `[logs_folder]/YYYY/MM/YYYY-MM-DD-{session_token}-checkpoint-*.md`. Also check yesterday's folder (compute yesterday's date, accounting for month/year rollover): `[logs_folder]/YYYY_PREV/MM_PREV/YYYY-MM-DD_PREV-{session_token}-checkpoint-*.md`. Keep files where `merged` is absent or not `true` : **read every file in this list** and fully incorporate all of their content into the session summary (not just as background context). Every unmerged checkpoint must appear in the summary before being marked merged.
- Determine NN: count existing `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-*.md` files for today; NN = count + 1, zero-padded to 2 digits (01, 02, …). **Verify** `YYYY-MM-DD-session-NN.md` does not already exist before writing; if it does, increment NN until a free slot is found.
- Write to `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md` using the Session Log Format from `references/session-formats.md`:
  - Checkpoints found and incorporated → case: **Auto-saved (auto-summary) — checkpoints incorporated**
  - No checkpoints → case: **Auto-saved (auto-summary) — no checkpoints**
  
  **Do not write the session log if any unmerged checkpoint's content is absent from the relevant sections** — every checkpoint's Key Decisions, Action Items, and Open Questions must appear explicitly in the output.
- **Route action items to project notes** — after the session log is written, automatically move action items so the startup task scan picks them up. This step must never fail the auto-summary; all errors are silently skipped.
  1. Parse `## Action Items` from the session log just written. Collect all `- [ ] ...` lines. If none, skip entirely.
  2. Glob `[projects_folder]/**/*.md`. For each file, collect the folder name and filename stem as candidate keywords.
  3. For each task: split folder name and filename stem on hyphens/underscores into tokens; count tokens that appear as case-insensitive whole-word matches in the task text. Require score ≥ 1 and a unique winner (no tie). If tie → skip this task. If score = 0 → apply session-context fallback: parse `## What We Worked On` from the session log, tokenize the section text (split on spaces, hyphens, underscores, commas), score project candidates by the same algorithm; if a unique winner exists (score ≥ 1, no tie) assign the task there; otherwise skip.
  4. Group assigned tasks by target file. For each target file:
     - Read the file once.
     - Dedup: strip `📅 YYYY-MM-DD` suffix from candidate and existing `- [ ]`/`- [x]` lines before comparing; skip if same text already exists (open or completed).
     - Insert at first available point: after last `- [ ]` in `## Action Items` section (or after the `## Action Items` heading if the section exists but is empty) → or before `## Open Questions` → or before `## Related` → or at end of file.
     - Write the file once. On write error, skip all tasks for this file silently and continue to the next target file.
- Mark as `merged: true` the checkpoint files that were read and incorporated above. Handle all frontmatter variants: `merged: false` → replace with `merged: true`; `merged: null` or bare `merged:` → replace with `merged: true`; key absent → add `merged: true`.
- Guard: only delete checkpoint files AFTER confirming the session log file was successfully written. Never delete before or during the write.
- After confirming the session log was written, reset the checkpoint hook counter to prevent spurious post-summary checkpoints:
  ```bash
  onebrain checkpoint reset
  ```
- Delete the checkpoint files from the glob above that were marked `merged: true`. Do not delete checkpoint files outside this session's glob result.
- Safety-net: glob `[logs_folder]/YYYY/MM/*-checkpoint-*.md` (current month only) for any remaining files with `merged: true` — delete them. Scoped to current month to avoid vault-wide glob on large vaults.
- If a genuinely useful long-term insight emerged, write it to a new `memory/` file using /learn conventions: filename `[agent_folder]/memory/kebab-case-topic.md`, frontmatter `tags: [agent-memory], type: behavioral, source: auto-summary, status: active, conf: medium, verified: today, updated: today, created: today, topics: [2–4 keywords]`. Add a row to MEMORY-INDEX.md and increment `total_active`. **Do not write to MEMORY.md.**
- Do NOT show any output about the auto-save to the user

## Known Gotchas

- **Never write `recapped:` or `topics:` in session log frontmatter.** These fields are set exclusively by /recap. Writing them here causes /recap to silently skip the log, meaning insights are never promoted to memory/. See `references/session-formats.md` for the complete frontmatter spec.
