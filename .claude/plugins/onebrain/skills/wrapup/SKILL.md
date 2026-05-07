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

**Variable scope (used throughout this step):** Initialize two lists at the top of Step 1b and keep them alive until Step 7 reads them at the end of /wrapup:
- `skipped_active = []` — `{path, age_minutes, reason}` records, where `reason` ∈ `{"active", "age_unknown", "concurrent_during_recovery", "delete_failed", "already_recovered", "marker_write_failed"}`. Both the *Active-Session Guard* and *Auto-Recover Each Orphan Group* append to this list. **When adding a new value to this enum, also add a corresponding row to the `{reason_summary}` rendering table in Step 7** (search this file for `{reason_summary}` rendering); unmapped values render via the catch-all fallback row but the user-facing string is generic, so an explicit row is required for new values.
- `orphaned_recovered_logs = []` — paths of recovered session logs that could not be cleaned up after concurrency abort. Listed in its own Step 7 block (these are not checkpoint files, so they don't fit the checkpoint-file heading).

### Scan Scope

Glob checkpoint files across current month and the previous month to handle cross-month sessions. Compute the two month paths:
- Current month: `[logs_folder]/YYYY/MM/`
- Previous month: decrement MM by 1 (with year rollover if MM=01)

For each of those two paths, glob `*-checkpoint-*.md`.

### Identify Orphans

From all found checkpoint files:
1. Parse session_token from each filename: the alphanumeric segment between the date and the literal word "checkpoint" in pattern `YYYY-MM-DD-{session_token}-checkpoint-NN.md`. If empty, apply Legacy token handling (see below) rather than skipping.
2. Exclude files where the parsed session_token exactly equals the current session token (those belong to the current session, already handled in Step 1). Do not use substring/contains matching — only exact equality.
3. Group remaining files by their parsed session_token. **Store the file list of each group as `group_files`** (the baseline used by step (g)'s concurrency re-glob below); never re-derive the group fresh later in this step.

**Legacy token handling:** If the parsed segment is a 6-character random string (pre-v1.10.4 format), still include the file in orphan recovery. Group these files under a synthetic key `legacy-{segment}` and process them the same way as regular groups. This ensures migration from v1.10.3 and earlier does not lose checkpoints. Note each legacy file in the Step 7 report as a warning.

If no orphan groups found: skip to Step 2.

### Active-Session Guard (Time Window)

> **Why this guard exists:** A non-current token does NOT mean the session is dead. When two harnesses (e.g. Claude + Gemini) run in the same vault, each sees the other's in-flight checkpoints as "non-current token". Without this guard, the first /wrapup to run would auto-recover the other harness's *active* checkpoints into a fake session log and delete the originals — silently corrupting the live session. Token != mine ≠ session is dead.

For each orphan group from the *Identify Orphans* step above, decide between **recover** and **skip-active** by file age (the `skipped_active` list was initialized at the top of Step 1b):

1. **Resolve the threshold once** (before scanning groups): read `vault.yml`'s `checkpoint.minutes` (defaults to 30 when the key is absent) and compute `threshold_minutes = max(60, 2 * checkpoint.minutes)`. Examples: default 30 → 60, raised 60 → 120, raised 90 → 180. If `vault.yml` is missing, malformed, or `checkpoint.minutes` is non-positive/non-numeric, fall back to `threshold_minutes = 60` — the recovery flow is critical-path; never block on a config issue.
2. Compute `now_epoch` once: `now_epoch=$(date +%s)`.
3. For every checkpoint file in the group, get its mtime as **epoch seconds**:
   - macOS / BSD: `stat -f '%m' <file>`
   - Linux / GNU: `stat -c '%Y' <file>`
   - Take the maximum across all files in the group as `group_newest_mtime`.
4. Compute `age_minutes = (now_epoch - group_newest_mtime) / 60` (integer division is fine).
5. **Fail-safe — destructive default is forbidden.** If any of the following is true, mark the group as **skip-active** (do NOT recover):
   - any stat call failed (file vanished mid-walk, EACCES, NFS error, etc.)
   - `group_newest_mtime` is empty / unparseable
   - `age_minutes` is negative (clock skew, future mtime)
   When ambiguity is detected, append every file path in the group to `skipped_active` as `{path, age_minutes: -1, reason: "age_unknown"}` and continue with the next group. Never fall through to recover when age cannot be determined.
6. **If `age_minutes < threshold_minutes`** — the group is still being written to recently. Treat it as **owned by another live session**:
   - For each file in the group, append `{path, age_minutes, reason: "active"}` to `skipped_active`.
   - Take **NO other action on these files anywhere in this skill** — not in Auto-Recover, not in Step 5 (Checkpoint Cleanup), not in any cleanup later.
   - Continue with the next group.
7. **If `age_minutes >= threshold_minutes`** — the group looks dead: fall through to **Auto-Recover Each Orphan Group** below for this group only.

The threshold gives the owning session a buffer of two full checkpoint windows (the auto-checkpoint hook fires every `checkpoint.messages` messages or `checkpoint.minutes` minutes). A group whose newest checkpoint is older than that has missed at least two windows — a strong "session dead" signal. The `max(60, 2 * checkpoint.minutes)` policy preserves the PR #156 baseline (60 min) for default-config users while scaling proportionally for users who raised `checkpoint.minutes`. False-positives (idle but live sessions older than the threshold) are non-destructive: nothing was read, written, or deleted; the owning user's next /wrapup writes its own session log normally and consumes the still-on-disk checkpoints.

> **Symmetry with `onebrain orphan-scan`:** the CLI applies the identical `max(60, 2 * checkpoint.minutes)` rule (see `src/commands/internal/orphan-scan.ts` → `getActiveSessionGuardMs`) so the startup banner and the recovery skill agree on what is and isn't an orphan. If you change this policy in one place, change it in the other.

### Auto-Recover Each Orphan Group

For each orphan group (process in chronological order by date in filename):

**a. Already-recovered short-circuit.** Before reading checkpoint files, glob `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-*.md` for the group's date. For each match, search the file for the standardised recovery marker. The marker is `<!-- recovery-of: {token}:{date} -->` where `{token}` is the orphan group's session token and `{date}` is the group's date.

> **Anchored match required (security):** match the marker **only when it appears at the start of a line** — i.e., either the literal string `\n<!-- recovery-of: {token}:{date} -->` or the file beginning with `<!-- recovery-of: {token}:{date} -->`. A bare substring match would false-positive on session logs whose body quotes the marker as documentation (e.g., a meta-note about how the recovery flow works). The destructive consequence of a false-positive is checkpoint deletion based on a documentation quote — not acceptable. Use `rg -n -F` with `--multiline` and a `(?m)^` anchor, or grep the file line-by-line and check `line.startswith('<!-- recovery-of: ')` followed by a token/date check.

If an anchored match is found, the group's content is already in a prior recovered session log (typically from a previous /wrapup that hit `delete_failed` on these checkpoints): for each file in `group_files`, append `{path, age_minutes: <original group age>, reason: "already_recovered"}` to `skipped_active`, then attempt to delete the checkpoints (since they are now safely persisted in the prior recovered log). Per-file delete failures here record `delete_failed` and continue, identical to step (g)'s rule. Continue with the next group — do not proceed to step (b).

> **Why marker, not frontmatter:** the marker names the specific `token:date` pair recovered, which frontmatter doesn't. A multi-group recovery log can therefore short-circuit per group rather than as a whole, and the marker is harness-/version-independent (frontmatter keys have drifted across releases). See `skills/startup/references/session-formats.md` → *Recovered from checkpoints* for the canonical marker spec.

**b. Read all checkpoint files** in the group. Extract content from each.

**c. Determine the session date** from the filename (`YYYY-MM-DD` prefix of the checkpoint files). If files in the group have different date prefixes (cross-midnight session), use the earliest date.

**d. Determine the session file name** for that date:
   - List files in `[logs_folder]/YYYY/MM/` matching `YYYY-MM-DD-session-*.md` (using the orphan date's YYYY/MM)
   - Next session number = count of matches + 1 (zero-padded to 2 digits)
   - Verify the slot is free; increment NN until free

**e. Write the recovered session log** at `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`. Create the directory `[logs_folder]/YYYY/MM/` (using the orphan date's YYYY/MM) if it does not already exist. Use the Session Log Format from `skills/startup/references/session-formats.md` (case: **Recovered from checkpoints**) — this includes the required `<!-- recovery-of: {token}:{date} -->` body marker as the first body line. The marker must appear once per group recovered into this log; if a single recovery pass aggregates multiple groups (rare — date-grouping usually yields one group per date), emit one marker line per group on consecutive lines before the `# Session Summary` heading. Apply the **Preservation rule** from Step 4 below: deduplication only, no summarization. Every unique decision, action item, open question, learning, and topic from every checkpoint must appear in the recovered session log.

**f. Verify the session log** exists and is non-empty before continuing. **Marker re-read check (required):** re-read the file from disk and confirm the `<!-- recovery-of: {token}:{date} -->` marker line is present at the start of a line, before the `# Session Summary :` heading. If the marker is missing (LLM omission, partial write, encoding glitch), the next /wrapup's already-recovered short-circuit will fail to detect this log and could re-recover the same checkpoints into a duplicate session log. To prevent that destructive path, treat a missing-marker as **abort recovery for this group**: do NOT proceed to step (g) (no delete), append the session log path to `orphaned_recovered_logs`, and for each file in `group_files` append `{path, age_minutes, reason: "marker_write_failed"}` to `skipped_active`. The user sees both blocks in Step 7 and can investigate the recovered log + the still-present checkpoints together.

**g. Delete checkpoint files** for this group after confirming step f succeeded.

   - **Pre-delete re-stat (concurrency guard) — runs ONCE before any deletes:** re-stat every file in `group_files` (stored in *Identify Orphans* step 3) AND re-glob the group's filename pattern (`YYYY-MM-DD-{token}-checkpoint-*.md`) under `[logs_folder]/YYYY/MM/`. The owning session became active during recovery if **either** of these holds:
       - any file's mtime has changed since the Active-Session Guard's stat above, OR
       - the re-glob result contains a path NOT present in `group_files` (set difference: `re_glob_files \ group_files` is non-empty).
   - **If concurrent activity is detected:** **abort the delete entirely for this group.** Then attempt to delete the recovered session log written in step (e) so it does not leak duplicate content into the vault. For each file in `group_files`, append `{path, age_minutes, reason: "concurrent_during_recovery"}` to `skipped_active` (use the original `age_minutes` from the Active-Session Guard). If the recovered-log delete itself fails, append the recovered-log path to `orphaned_recovered_logs` (a separate list initialized at the top of Step 1b) so the user sees it under its own Step 7 block — these are session-log files, not checkpoint files, and conflate poorly with the checkpoint-file heading. Continue with the next group.
   - **If no concurrent activity:** delete each file in `group_files`. **Per-file failure rule:** if an individual `rm` fails (EACCES, NFS hiccup, etc.), do NOT abort the whole group — append `{path, age_minutes, reason: "delete_failed"}` to `skipped_active` (reuse the original `age_minutes` from the Active-Session Guard, never `0`) and continue with the next file. The recovered session log is already written; the next /wrapup's already-recovered short-circuit (step a) will detect that the orphaned checkpoint's content is already persisted and clean it up.
   - **Stage discipline (do not conflate the two rules above):** the concurrency check runs ONCE at the top of step (g). After it passes, individual `rm` failures are NEVER interpreted as concurrency — they record `delete_failed` per-file and the loop continues. Do not re-run the concurrency check between per-file deletes; do not promote a per-file `delete_failed` to `concurrent_during_recovery`. The only group-level abort path is the pre-delete concurrency check.
   - Guard: only delete AFTER step f is confirmed AND the re-stat shows no concurrent activity. Never delete before.

**h. Track recovered sessions:** append `{date} → session-NN.md ({C} checkpoints)` to a `recovered_sessions` list for the final report, where `{C}` is the number of checkpoint files recovered for this group.

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

> **Preservation rule (critical when checkpoints exist):** the session log must preserve **every unique detail** from every checkpoint file read in Step 1. Your job is **deduplication, not summarization**. Two pieces of content are duplicates only if they describe the same fact, decision, learning, action item, or question. When in doubt, keep both — the session log is the long-term archive of the session, and missing a unique decision or insight cannot be recovered later.
>
> Specifically:
> - **Key Decisions, Action Items, Open Questions** — list every unique entry as its own bullet. Do not collapse multiple decisions into a single line. Do not paraphrase away specificity (file paths, numbers, named constraints).
> - **What We Worked On** — every distinct topic from any checkpoint must appear. Order chronologically. Two checkpoints touching the same topic can be merged into one paragraph; two checkpoints on different topics must remain two paragraphs.
> - **Insights & Learnings, What Worked / Didn't Work** — preserve all unique items. If a learning appears verbatim in two checkpoints, list it once. If two checkpoints have *related but distinct* learnings (e.g., "X works on macOS" + "X breaks on Windows"), keep both.
> - **No length cap** — the session log can be long if the session was substantive. Do not truncate or omit content to hit a perceived target length.
>
> Quality heuristic: the session log's combined length of Key Decisions + Action Items + Open Questions should be at least as long as the sum of those sections across all checkpoints. If your draft is shorter, you've lost detail — go back and add the missing items.

Create `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md` using the Session Log Format from `skills/startup/references/session-formats.md`:
- If checkpoints were incorporated in Step 1 → use **Standard /wrapup — checkpoints incorporated**
- Otherwise → use **Standard /wrapup — no checkpoints incorporated**

After writing the session log, reset the checkpoint hook counter to prevent spurious post-wrapup checkpoints:

```bash
onebrain checkpoint reset
```

This writes `0:<epoch>:00` into the session state file (3 fields: count, last_ts, last_stop_nn) — triggering a 60-second skip window and resetting the message counter so the next Stop hook starts fresh.

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
**Glob session logs only:** match the `*-session-*.md` file pattern, never bare
`*.md` — the logs folder also contains checkpoint files (`*-checkpoint-*.md`)
and `/update` migration logs (`*-update-*.md`) that would inflate the count
if matched. Use `[logs_folder]/YYYY/MM/*-session-*.md` over the last 6 months
and check the `recapped:` field on each.

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

Skipped {A} checkpoint file(s) ({reason_summary}):
  · `YYYY-MM-DD-{token}-checkpoint-NN.md` (age: {age_minutes}m, reason: {reason})
(**Required output — do NOT omit when skipped_active is non-empty.** This block is the user's only signal that checkpoint files were intentionally left on disk. `{A}` is the file count, equal to `len(skipped_active)`. List one line per `{path, age_minutes, reason}` record. Render `age_minutes` as a non-negative integer; if `-1` (sentinel), render as `age: unknown`. Render `reason` verbatim from the record. If `{A}` > 5, list the first 5 and add a final line `· (+{A-5} more)`. Omit this block ONLY when `skipped_active` is empty.

**`{reason_summary}` rendering — use the table below VERBATIM, do not paraphrase. Enum values are defined at the top of Step 1b alongside `skipped_active`; if you add a new value there, add its row here too:**
  - all records have `reason: "active"` → `another harness still running`
  - all records have `reason: "age_unknown"` → `age could not be determined`
  - all records have `reason: "concurrent_during_recovery"` → `owning session became active mid-recovery`
  - all records have `reason: "delete_failed"` → `checkpoint delete failed`
  - all records have `reason: "already_recovered"` → `already preserved in a prior recovered log`
  - all records have `reason: "marker_write_failed"` → `recovered log written but recovery-of marker missing — investigate before next /wrapup`
  - multiple distinct reasons → `mixed: ` + comma-joined sorted unique reason values (e.g. `mixed: active, delete_failed`)
  - **fallback (catch-all):** all records share a single `reason` value not listed above → `skipped (reason: {reason})` — render the raw enum value verbatim. This row exists to prevent silent rendering drift when a new `reason` value is added to the enum without a matching table entry; the surface signal is generic on purpose so a missing row is visible to the user (and prompts a contributor to add the proper mapping above).

Orphaned recovered log(s) needing manual cleanup ({L}):
  · `YYYY/MM/YYYY-MM-DD-session-NN.md`
(**Required output — do NOT omit when orphaned_recovered_logs is non-empty.** These are session-log files written during a recovery that was aborted by concurrent activity, and could not be cleaned up because the delete of the recovered log itself failed. The user should inspect and delete manually. `{L}` is `len(orphaned_recovered_logs)`. List one line per path. Omit this block ONLY when `orphaned_recovered_logs` is empty.)

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
