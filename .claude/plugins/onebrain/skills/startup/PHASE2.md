# Phase 2 — Background Sub-agent Instructions

The sub-agent receives the payload from Phase 1 and performs all work that requires multiple file reads. It does NOT read MEMORY.md for content — `active_tasks` are passed in the prompt. It may count lines in MEMORY.md for the overflow guard (Step 5). All folder values in the payload are relative to `vault_root`; construct full paths as `vault_root/folder_value`.

**Run all steps in parallel.** They are independent — do not wait for one before starting the next. Return combined results when all complete.

---

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
   - Glob `[logs_folder]/**/*-checkpoint-*.md` (matches both legacy and token-format filenames)
   - Keep only files where the **date in the filename is before today**
   - Discard files older than 3 days (too stale to synthesize meaningfully)
   - Read frontmatter of each remaining file — **exclude any file where `merged: true`**
   - **Also check**: if a `/wrapup` session log already exists for that date — a session log without `auto-saved: true` in its frontmatter was written by `/wrapup` manually; skip that date's checkpoints entirely — /wrapup already handled them.
   - What remains are true orphans

   **Group by token:**
   - For each orphan file, parse its filename:
     - Token format: `YYYY-MM-DD-{token}-checkpoint-NN.md` → extract `{token}` (6-char alphanumeric)
     - Legacy format: `YYYY-MM-DD-checkpoint-NN.md` (no token) → assign to a "legacy" group per date
   - Files with the same token (and same date) form one group → one session log
   - Legacy files on the same date form one legacy group → one session log
   - **Exclude** any group whose token matches `session_token` from the Phase 1 payload (those belong to the current live session — not orphaned yet)

   **Act on the total group count:**
   - **0 groups** : nothing to do; set `orphan_action: none`
   - **1–5 groups** : auto-synthesize silently, one session log per group:
     1. Read every checkpoint file in the group and extract its full content
     2. The session log date = date from the checkpoint filenames in this group
     3. Count existing session logs for that date (`YYYY-MM-DD-session-*.md`) → next NN, zero-padded to 2 digits
     4. Write session log to `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md` with frontmatter:
        `auto-saved: true`, `synthesized_from_checkpoints: true`
        For token groups (non-legacy), also add: `session_token: {token}`
        - **Every Key Decision, Action Item, and Open Question from every checkpoint must appear explicitly in the log** — do not write until all checkpoint content is reflected
        - **If the write fails**: do not mark any checkpoints `merged: true`; set `orphan_action: none` and stop
     5. Mark each incorporated checkpoint `merged: true`
     6. Set `orphan_action: merged:{N}` (N = total checkpoints merged across all groups)
   - **>5 groups** : too many to synthesize safely; set `orphan_action: prompt_wrapup:{N}` (N = total checkpoints)

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
   - Include `memory_lines: N` in the return payload only if count > 180; otherwise omit

6. **Return** to main agent:
   ```
   briefing: "[assembled briefing text from step 1]"
   orphan_action: none | merged:{N} | prompt_wrapup:{N}
   context_hints: [path1, path2, ...]
   stale_notes: [{path: string (vault-relative), days_since_modified: integer}, ...]
   memory_lines: N          # only present when MEMORY.md exceeds 180 lines
   ```
