---
name: wrapup
description: "Wrap up and save the current session summary to the session log. Use at end of session when the user says 'bye', 'wrap up', 'save session', or an end-of-session signal is detected. /wrapup writes to 07-logs/ only. Do NOT use for: promoting insights to memory/ (use recap), synthesizing a topic across sessions (use distill), or teaching a single preference (use learn)."
---

# Session Summary (TL;DR)

Generates a summary of this session and saves it to the logs folder for future recall.

---

## Scope

/wrapup writes the session log only. It does NOT promote insights to memory/ — that is
/recap's responsibility. Do not write to MEMORY.md or memory/ files.

---

## Session Log Frontmatter

See `skills/startup/references/session-formats.md` → Session Log Format for frontmatter variants and body sections. **Never add `recapped:` or `topics:`** — those are populated by /recap later.

---

## Step 1: Gather Checkpoint Context

1. Get today's date as `YYYY-MM-DD`. Extract `YYYY` and `MM`.
2. Use `session_token` from context if already loaded (set by `onebrain session-init` at startup); if absent, run `onebrain session-init` and use the `SESSION_TOKEN` value.
3. Glob checkpoint files:
   - Glob `[logs_folder]/YYYY/MM/YYYY-MM-DD-{session_token}-checkpoint-*.md`
   - Also check yesterday's folder: compute yesterday's date (decrement by 1 day, accounting for month/year rollover); glob `[logs_folder]/YYYY_PREV/MM_PREV/YYYY-MM-DD_PREV-{session_token}-checkpoint-*.md`
4. If any found: **read every file** and extract its content. Every checkpoint must be fully incorporated during the review in Step 3 and reflected in the log written in Step 4 : not just used as background context. Checkpoints capture activity that may have been compressed out of current context; missing any of them means losing that history.
5. Store the list of found checkpoint paths for use in Step 5. **Only paths that were read and incorporated go on this list.**

If none found: continue normally.

> **Note on cleanup:** Checkpoints are deleted (not annotated) after the session log is successfully written. Any checkpoint file that still exists is unmerged by definition; no `merged:` filter is needed.

---

## Step 1b: Orphan Recovery Scan

After Step 1, scan for unmerged checkpoints belonging to **other** sessions (orphans).

### Scan Scope

Glob checkpoint files across current month and the previous month to handle cross-month sessions. Compute the two month paths:
- Current month: `[logs_folder]/YYYY/MM/`
- Previous month: decrement MM by 1 (with year rollover if MM=01)

For each of those two paths, glob `*-checkpoint-*.md`.

### Identify Orphans

From all found checkpoint files:
1. Parse session_token from each filename: the alphanumeric segment between the date and the literal word "checkpoint" in pattern `YYYY-MM-DD-{session_token}-checkpoint-NN.md`. If empty, apply Legacy token handling (see below) rather than skipping.
2. Exclude files where the parsed session_token exactly equals the current session token (those belong to the current session, already handled in Step 1). Do not use substring/contains matching — only exact equality.
3. Group remaining files by their parsed session_token

**Legacy token handling:** If the parsed segment is a 6-character random string (pre-v1.10.4 format), still include the file in orphan recovery. Group these files under a synthetic key `legacy-{segment}` and process them the same way as regular groups. This ensures migration from v1.10.3 and earlier does not lose checkpoints. Note each legacy file in the Step 7 report as a warning.

If no orphan groups found: skip to Step 2.

### Auto-Recover Each Orphan Group

For each orphan group (process in chronological order by date in filename):

**a. Read all checkpoint files** in the group. Extract content from each.

**b. Determine the session date** from the filename (`YYYY-MM-DD` prefix of the checkpoint files). If files in the group have different date prefixes (cross-midnight session), use the earliest date.

**c. Determine the session file name** for that date:
   - List files in `[logs_folder]/YYYY/MM/` matching `YYYY-MM-DD-session-*.md` (using the orphan date's YYYY/MM)
   - Next session number = count of matches + 1 (zero-padded to 2 digits)
   - Verify the slot is free; increment NN until free

**d. Write the recovered session log** at `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`. Create the directory `[logs_folder]/YYYY/MM/` (using the orphan date's YYYY/MM) if it does not already exist. Use the Session Log Format from `skills/startup/references/session-formats.md` (case: **Recovered from checkpoints**). All key decisions, action items, and open questions from checkpoints must appear explicitly — do not collapse into one line.

**e. Verify the session log** exists and is non-empty before continuing.

**f. Delete checkpoint files** for this group after confirming step e succeeded. Guard: only delete AFTER step e is confirmed. Never delete before.

**g. Track recovered sessions:** append `{date} → session-NN.md ({C} checkpoints)` to a `recovered_sessions` list for the final report, where `{C}` is the number of checkpoint files recovered for this group.

---

## Step 2: Determine Session File Name

1. Using the date from Step 1, extract `YYYY`, `MM` (zero-padded month), and `DD` (zero-padded day).
2. List files in `[logs_folder]/YYYY/MM/` matching **`YYYY-MM-DD-session-*.md`** — use today's actual date as a literal prefix (e.g. `2026-04-25-session-*.md`), not as a wildcard. Only count sessions from today.
3. The next session number = count of matches + 1 (zero-padded to 2 digits: 01, 02, etc.)
4. Verify `YYYY-MM-DD-session-NN.md` does not already exist before writing; if it does, increment NN until a free slot is found.
5. File name: `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`

---

## Step 3: Review the Session

Reflect on the conversation that just occurred. Identify:

- **Main topic(s)** : What did we work on?
- **Key decisions made** : Any choices, directions, or conclusions reached
- **Insights or learnings** : New understanding, patterns noticed, things discovered
- **What worked / didn't work** : Approaches or tools that helped, and anything that slowed us down or failed (omit if nothing notable)
- **Action items** : Tasks to do, things to follow up on
- **Open questions** : Unresolved questions or things to investigate

---

## Step 4: Write the Session Log

> **If checkpoints were found in Step 1:** do not write the session log until the content of every checkpoint file read in Step 1 is reflected in the sections below. All Key Decisions, Action Items, and Open Questions from checkpoints must appear explicitly : not summarized into a single line.

Create `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md` using the Session Log Format from `skills/startup/references/session-formats.md`:
- If checkpoints were incorporated in Step 1 → use **Standard /wrapup — checkpoints incorporated**
- Otherwise → use **Standard /wrapup — no checkpoints incorporated**

After writing the session log, reset the checkpoint hook counter to prevent spurious post-wrapup checkpoints:

```bash
onebrain checkpoint reset
```

This writes `0:<epoch>:00` into the session state file, triggering a 60-second skip window and resetting the message counter.

---

## Step 4b: Route Action Items to Project Notes

After the session log is written, automatically move action items to the appropriate project note so the startup task scan picks them up.

Store `routed_tasks = []` and `skipped_tasks = []` for use in Step 7.

**4b-1. Extract tasks.** Parse the `## Action Items` section of the session log just written. Collect all lines matching `- [ ] ...`. If none, skip this step entirely.

**4b-2. Discover project notes.** Glob `[projects_folder]/**/*.md`. For each file, collect the folder name (first path segment under `[projects_folder]`) and the filename stem as candidate keywords.

**4b-3. Score and group tasks by target.**

Store `skipped_score0 = []` and `skipped_ties = []` alongside `skipped_tasks` for internal tracking.

For each task line:
  - Score each candidate project note: split the folder name and filename stem on hyphens and underscores to produce individual keyword tokens, then count how many tokens appear as case-insensitive whole-word matches in the task text.
  - Select the highest-scoring candidate. **Require score ≥ 1 and a unique winner (no tie at the top score)** to route.
  - If score = 0 → add to `skipped_score0` and `skipped_tasks`; leave task in session log only.
  - If two or more files tie at the top score → add to `skipped_ties` and `skipped_tasks`; leave task in session log only.
  - Otherwise → assign the task to the winning project note.

**4b-3b. Session-context fallback for score-0 tasks.**

If `skipped_score0` is non-empty, resolve a session context project:
  - Parse the `## What We Worked On` section of the session log.
  - Tokenize the section text (split on spaces, hyphens, underscores, commas).
  - Score each project note candidate using the same token-match algorithm as 4b-3.
  - If a unique winner exists (score ≥ 1, no tie) → that is the `context_project`.
  - For each task in `skipped_score0`: remove it from `skipped_tasks` and assign it to `context_project`.
  - If `## What We Worked On` is absent or produces no unique `context_project` → these tasks stay in `skipped_tasks`.
  - Tasks in `skipped_ties` are never candidates for the fallback — they remain in `skipped_tasks`.

Group all assigned tasks by their target file path. This avoids repeated reads and writes to the same note.

**4b-4. Write each target file once.**

For each target file with one or more assigned tasks:
  - Read the file once.
  - For each task assigned to this file:
    - **Dedup check:** strip the trailing `📅 YYYY-MM-DD` suffix from both the candidate task and all existing task lines (lines matching `- [ ]` or `- [x]`) before comparing. If a task with the same text (open or completed) already exists in the file, skip this task; add to `skipped_tasks`.
    - **Insertion point (priority order):**
      1. Find an existing `## Action Items` section — append after the last `- [ ]` line in it, or after the heading if the section is empty.
      2. If no `## Action Items` section: insert one before `## Open Questions` if present, otherwise before `## Related`, otherwise at the end of the file. Add a blank line before and after the new heading.
    - Collect all non-skipped tasks for this file.
  - If no non-skipped tasks remain after dedup, skip the write entirely for this file.
  - Otherwise write the updated file once. On write error, move all non-deduped tasks for this file to `skipped_tasks` and continue.
  - Store the vault-relative path (e.g. `01-projects/onebrain/OneBrain.md`) as `relative_path`. Append each successfully inserted task as `{task_text, relative_path}` to `routed_tasks`.

**4b-5. This step must never fail /wrapup.** All errors (read/write failures, no project notes found) are silently handled per task or per file. The session log is always the source of truth.

---

## Step 5: Checkpoint Cleanup

After the session log from Step 4 is written successfully, delete every checkpoint file path stored in Step 1.

Guard: only delete AFTER confirming the session log write succeeded. Never delete before or during write. If an individual delete fails, skip it silently — stale checkpoints are cleaned up later by /doctor or by the next /wrapup.

> **Why direct delete (no `merged:` annotation):** A successfully written session log is itself the proof that the checkpoint content is preserved. Annotating the checkpoint with `merged: true` and then deleting it adds a write step that can fail and provides no recovery benefit — if the session log write succeeds, the checkpoint is safe to delete; if it fails, we never reach this step.

---

## Step 6: Recap Reminder

At the end of every /wrapup, compute `unrecapped_count` and `last_recapped`:

**Fast path:** read `stats.last_recap` from `vault.yml` if available.
**Fallback:** if `vault.yml` stats missing, glob session logs from last 6 months only
(`07-logs/YYYY/MM/*.md`) and check `recapped:` field.

Compute:
- `unrecapped_count` — number of session logs without `recapped:` field
  (always ≥ 1 after /wrapup runs — the log just written has no `recapped:` yet)
- `last_recapped` — most recent `recapped:` date found (absent = never)

Display based on condition:
- unrecapped 1–3, last recap ≤ 7 days ago:
    💾 {N} session logs not yet recapped (last: YYYY-MM-DD)
- unrecapped > 3 OR last recap > 7 days ago:
    ⚠️ {N} session logs not yet recapped — last recap: YYYY-MM-DD
- never recapped:
    ⚠️ {N} session logs not yet recapped — never recapped

---

## Step 7: Confirm

Say:
──────────────────────────────────────────────────────────────
💾 Session Saved
──────────────────────────────────────────────────────────────
`[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`

I logged {N} action items.
(omit this line if no action items)

Routed {R} action item(s) to project notes:
  → [task text] → `01-projects/…/Note.md`
(omit this block if routed_tasks is empty; list one line per routed task, using the vault-relative path stored in routed_tasks)

Skipped routing (no match / tie):
  · [task text]
(omit this block if skipped_tasks is empty; list one line per skipped task)

Auto-recovered {S} orphan session(s):
  {YYYY-MM-DD} → `session-NN.md` ({C} checkpoints)
(omit this block if none recovered)

{Recap reminder message from Step 6}

Good session! See you next time.

---

## In-Skill Examples

**Good Key Decisions section** (enough detail to reconstruct what happened):
```markdown
## Key Decisions

- Chose $PPID as session token because it is stable within a shell session and unique per terminal window
- Delete checkpoints directly after the session log write succeeds — the written log is the recovery proof, no `merged:` annotation needed
- Kept the state-file reset bash snippet in Step 4 rather than a hook, to avoid hook-ordering issues
```

**Bad Key Decisions section** (too vague to be useful later):
```markdown
## Key Decisions

- Fixed a bug
- Made some changes to wrapup
- Updated the session handling
```

## Known Gotchas

- **Orphan checkpoints from a different token.** Rare case: if the vault was used before CLI v2.0.10 (which fixed the token mismatch between `session-init` and the stop hook), checkpoint files may exist under a different token than the current session. If Step 1 finds no checkpoints but you expect some, look for date-matching checkpoint files in the folder with any token and offer to synthesize them manually.

- **Cross-month midnight sessions.** If a session starts before midnight and /wrapup runs after midnight in a new month, Step 1 looks in "yesterday's folder." Decrementing the month is sufficient for all months except January — for January specifically, also roll back the year (e.g., January 1 → December of the prior year). All other month boundaries only need the month decremented.

- **Pre-v2.2.0 checkpoint files with `merged:` field.** Older vaults may contain checkpoint files that have a `merged: false` or `merged: true` frontmatter field from earlier wrapup runs. The new flow ignores this field entirely — any checkpoint file that exists at /wrapup time is treated as unmerged, regardless of the field's value. The 14-day-old check in /doctor catches any stragglers regardless of the field.

- **Duplicate session slot collision.** If auto-save and a manual /wrapup run nearly simultaneously, both may try to write `session-01.md`. Step 2 already verifies the slot is free before writing — do not skip this check even when synthesizing from checkpoints.
