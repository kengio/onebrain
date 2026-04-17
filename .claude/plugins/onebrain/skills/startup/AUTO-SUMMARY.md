# Auto Session Summary Instructions

Session summaries are auto-saved silently at session end. Users can still run `/wrapup` manually for a visible summary.

Before your final response in a session, silently save a session summary if ALL of these are true:
1. The session had 3 or more user↔assistant exchanges
2. No `/wrapup` was run during this session (check the logs folder for a file matching today's date with matching topics)

If conditions are met:
- Determine own session token: glob `[logs_folder]/.sessions/YYYY-MM-DD-*.token` for today; read most recently modified file; store as `own_token` (empty if none found).
- Glob checkpoint files (token-aware): if `own_token` set → glob `[logs_folder]/YYYY/MM/YYYY-MM-DD-{own_token}-checkpoint-*.md`; if empty → glob `[logs_folder]/YYYY/MM/YYYY-MM-DD-checkpoint-*.md` (legacy fallback). Keep files where `merged` is absent or not `true` : **read every file in this list** and fully incorporate all of their content into the session summary (not just as background context). Every unmerged checkpoint must appear in the summary before being marked merged.
- Determine NN: count existing `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-*.md` files for today; NN = count + 1, zero-padded to 2 digits (01, 02, …). **Verify** `YYYY-MM-DD-session-NN.md` does not already exist before writing (the Phase 2 sub-agent may have written one concurrently); if it does, increment NN until a free slot is found.
- Write to `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md` using the same format as `/wrapup` (see `.claude/plugins/onebrain/skills/wrapup/SKILL.md` for format). **Do not write the session log if any unmerged checkpoint's content is absent from the relevant sections** : every checkpoint's Key Decisions, Action Items, and Open Questions must appear explicitly in the output.
- Add `auto-saved: true` to the frontmatter; if the checkpoint glob returned at least one file and all were successfully incorporated, also add `synthesized_from_checkpoints: true` — omit this field entirely if no checkpoints were found or incorporated
- Mark as `merged: true` only the checkpoint files that were read and incorporated above
- If a genuinely useful long-term insight emerged, write it to a new `memory/` file using /learn conventions: filename `[agent_folder]/memory/kebab-case-topic.md`, frontmatter `tags: [agent-memory], type: behavioral, source: auto-summary, status: active, conf: medium, verified: today, updated: today, created: today, topics: [2–4 keywords]`. Add a row to INDEX.md and increment `total_active`. **Do not write to MEMORY.md.**
- Do NOT show any output about the auto-save to the user
