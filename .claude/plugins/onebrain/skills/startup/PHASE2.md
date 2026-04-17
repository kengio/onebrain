# Phase 2 — Background Sub-agent Instructions

The sub-agent receives the payload from Phase 1 and performs all work that requires multiple file reads. It does NOT read MEMORY.md for content — `active_tasks` are passed in the prompt. It may count lines in MEMORY.md for the overflow guard (Step 5). All folder values in the payload are relative to `vault_root`; construct full paths as `vault_root/folder_value`.

**Sub-agent steps:**

1. **Daily briefing** — Gather data for the session-start briefing, using the same logic as `/daily` (always Normal mode; Phase 2 runs after the session has started).

   **Inbox count:**
   - Glob `[inbox_folder]/*.md` and count the files; store as `inbox_count`

   **Tasks due today or overdue:**
   - Grep `[projects_folder]/**/*.md` and `[inbox_folder]/*.md` for task lines matching `- [ ] .*📅 \d{4}-\d{2}-\d{2}`
   - Keep only tasks where the date ≤ today
   - Group: overdue first, then due today
   - Include the source note name for each task

   **Coming up (next 3 days):**
   - From the same grep results, keep tasks where date > today AND date ≤ today+3
   - Include the source note name for each task

   **Open from last session:**
   - Glob `[logs_folder]/**/*.md` matching filename pattern `YYYY-MM-DD-session-*.md`; find the most recent one whose `date` frontmatter is **before today**
   - If no such file exists, skip this section
   - Otherwise extract unchecked `- [ ]` items from its `## Action Items` section

   Assemble into this format (adapt language to match the user's):
   ```
   ## Daily Briefing · Ddd DD Mon YYYY · inbox N

   **Tasks due today:**
   - [ ] Task description 📅 YYYY-MM-DD (from "Note Name")
   - [ ] Overdue task 📅 YYYY-MM-DD (overdue - from "Note Name")

   **Coming up (3 days):**
   - [ ] Task description 📅 YYYY-MM-DD (from "Note Name")

   **Open from last session:**
   - [ ] Action item text
   ```
   - `Ddd` is the abbreviated day of week (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
   - Omit `· inbox N` if `inbox_count` is 0
   - Omit the "Coming up" section entirely if no tasks fall in that window
   - If all three task sources (due/overdue, coming up, and open from last session) are empty, use a single line: `No tasks or open items for today.`

2. **Orphan checkpoints** : Find checkpoint files from past sessions that were never turned into a session log. These need to be either auto-synthesized (if few) or flagged to the user (if many).

   **Filter down to true orphans:**
   - Glob `[logs_folder]/**/*-checkpoint-*.md`
   - Keep only files where the **date in the filename is before today**
   - Discard files older than 3 days (too stale to synthesize meaningfully)
   - Read frontmatter of each remaining file — **exclude any file where `merged: true`** (already processed)
   - **Also check**: if a `/wrapup` session log already exists for that date — match by the `YYYY-MM-DD` date prefix in the filename (e.g. checkpoints dated `2026-04-14` → look for `2026-04-14-session-*.md`). A session log without `auto-saved: true` in its frontmatter was written by `/wrapup` manually. If such a file exists for that date, skip that date's checkpoints entirely — /wrapup already handled them.
   - What remains are true orphans

   **Act on the count:**
   - **0 files** : nothing to do; set `orphan_action: none`
   - **1–5 files** : auto-synthesize silently, per date group:
     1. Read every checkpoint file in the group and extract its full content
     2. Count existing session logs for that date (`YYYY-MM-DD-session-*.md`) → next NN, zero-padded to 2 digits (e.g. `01`, `02`)
     3. Write a session log to `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md` with frontmatter fields `auto-saved: true` and `synthesized_from_checkpoints: true`
        - **Every Key Decision, Action Item, and Open Question from every checkpoint must appear explicitly in the log** : do not write the file until all checkpoint content is reflected
        - **If the write fails**: do not mark any checkpoints as `merged: true`; set `orphan_action: none` and stop — do not attempt further checkpoint processing
     4. For each checkpoint file whose content was read and incorporated: set `merged: true` in its frontmatter
     5. Set `orphan_action: merged:{N}` (where N = total number of checkpoints merged)
   - **>5 files** : too many to synthesize safely; set `orphan_action: prompt_wrapup:{N}` and let the user decide

3. **Context pre-loader** — Identify context files relevant to active projects so the main agent can load them on session start.

   - Read `active_tasks` from the payload and extract distinctive project name keywords (e.g. "OneBrain" from "OneBrain v2.0.0", "Finastra" from "Finastra onboarding") — use the most distinctive single word per project, lowercased
   - For each keyword, Glob `[agent_folder]/memory/` for files whose filename contains that keyword (case-insensitive)
   - Collect all matching file paths (relative to `vault_root`); deduplicate; keep max 3 total
   - Store as `context_hints: [list of relative file paths]`
   - If no matches found or `[agent_folder]/memory/` does not exist, store `context_hints: []`

4. **Stale note scanner** — Find project and area notes that have not been touched recently. (Resources are excluded intentionally — stale resources are managed via `/consolidate`.)

   - Glob `[projects_folder]/**/*.md` and `[areas_folder]/**/*.md`
   - For each file, check its filesystem last-modified date (mtime)
   - Keep only files where mtime is more than 30 days before today
   - Exclude any file whose name starts with `TASKS` or `MOC`
   - Sort results by mtime ascending (stalest first)
   - Keep max 5 results; if a folder does not exist, skip it
   - Compute `days_since_modified` as `floor((today - mtime_date).days)` — always an integer
   - Store as `stale_notes: [{path, days_since_modified}]` (paths relative to `vault_root`)
   - If none found, store `stale_notes: []`

5. **MEMORY.md overflow guard** — Check whether the agent memory file is approaching its size limit.

   - Count total lines in `[agent_folder]/MEMORY.md`
   - Include `memory_lines: N` in the return payload only if count > 160; otherwise omit

6. **Return** to main agent:
   ```
   briefing: "[assembled briefing text from step 1]"
   orphan_action: none | merged:{N} | prompt_wrapup:{N}
   context_hints: [path1, path2, ...]
   stale_notes: [{path: string (vault-relative), days_since_modified: integer}, ...]
   memory_lines: N          # only present when MEMORY.md exceeds 160 lines
   ```
