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

Write the session log with this frontmatter (omit `recapped:` and `topics:` — those are
populated by /recap later):

```yaml
---
tags: [session-log]
date: YYYY-MM-DD
session: NN
auto-saved: true                        # only if auto-saved
synthesized_from_checkpoints: true      # only if synthesized from checkpoints
---
```

Absence of `recapped:` field = not yet processed by /recap.

---

## Step 1: Gather Checkpoint Context

1. Get today's date as `YYYY-MM-DD`. Extract `YYYY` and `MM`.
2. Use `session_token` from context if already loaded; if absent, run the session token command via Bash and save to context. The session token is alphanumeric — numeric on Mac/Linux (`$PPID`), alphanumeric on Windows Terminal (`$WT_SESSION` prefix).
3. Glob checkpoint files:
   - Glob `[logs_folder]/YYYY/MM/YYYY-MM-DD-{session_token}-checkpoint-*.md`
   - Also check yesterday's folder: compute yesterday's date (decrement by 1 day, accounting for month/year rollover); glob `[logs_folder]/YYYY_PREV/MM_PREV/YYYY-MM-DD_PREV-{session_token}-checkpoint-*.md`
4. Filter: keep only files where frontmatter field `merged` is absent or not `true`
5. If any found: **read every file in the filtered list** and extract its content. Every checkpoint must be fully incorporated during the review in Step 3 and reflected in the log written in Step 4 : not just used as background context. Checkpoints capture activity that may have been compressed out of current context; missing any of them means losing that history.
6. Store the list of found checkpoint paths for use in Step 5. **Only paths that were read and incorporated go on this list.**

If none found: continue normally.

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
1. Read frontmatter of all found files; keep only where `merged` is absent or not `true`
2. Parse session_token from each filename: the alphanumeric segment between the date and the literal word "checkpoint" in pattern `YYYY-MM-DD-{session_token}-checkpoint-NN.md`. If empty, apply Legacy token handling (see below) rather than skipping.
3. Exclude files where the parsed session_token exactly equals the current session token (those belong to the current session, already handled in Step 1). Do not use substring/contains matching — only exact equality.
4. Group remaining files by their parsed session_token

**Legacy token handling:** If the parsed segment is a 6-character random string (pre-v1.10.4 format), still include the file in orphan recovery. Group these files under a synthetic key `legacy-{segment}` and process them the same way as regular groups. This ensures migration from v1.10.3 and earlier does not lose checkpoints. Note each legacy file in the Step 8 report as a warning.

If no orphan groups found: skip to Step 2.

### Auto-Recover Each Orphan Group

For each orphan group (process in chronological order by date in filename):

**a. Read all checkpoint files** in the group. Extract content from each.

**b. Determine the session date** from the filename (`YYYY-MM-DD` prefix of the checkpoint files). If files in the group have different date prefixes (cross-midnight session), use the earliest date.

**c. Determine the session file name** for that date:
   - List files in `[logs_folder]/YYYY/MM/` matching `YYYY-MM-DD-session-*.md` (using the orphan date's YYYY/MM)
   - Next session number = count of matches + 1 (zero-padded to 2 digits)
   - Verify the slot is free; increment NN until free

**d. Write the recovered session log** at `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`. Create the directory `[logs_folder]/YYYY/MM/` (using the orphan date's YYYY/MM) if it does not already exist.

```markdown
---
tags: [session-log]
date: YYYY-MM-DD
session: NN
synthesized_from_checkpoints: true
auto-recovered: true
---

# Session Summary : [Month DD, YYYY] (Session N)

## What We Worked On

[1-3 sentences synthesized from checkpoint content]

## Key Decisions

- [All key decisions from checkpoints — list explicitly, do not collapse into one line]

## Insights & Learnings

- [Insights from checkpoints]

## What Worked / Didn't Work

- ✅ / ❌ [From checkpoints — omit section if none noted]

## Action Items

- [ ] [Action items from checkpoints] 📅 YYYY-MM-DD

## Open Questions

- [Open questions from checkpoints]
```

**e. Write the session log** (per the template above). Verify the file exists and is non-empty before continuing.

**f. Mark checkpoints as merged:** only after step e succeeds — for each checkpoint file in this group, set `merged: true` (same rules as Step 5).

**g. Delete checkpoint files** for this group after confirming both e and f succeeded. Guard: only delete AFTER step e AND f are confirmed. Never delete before.

**h. Track recovered sessions:** append `{date} → session-NN.md ({C} checkpoints)` to a `recovered_sessions` list for the final report, where `{C}` is the number of checkpoint files merged for this group.

---

## Step 2: Determine Session File Name

1. Using the date from Step 1, extract `YYYY` and `MM` (zero-padded month).
2. List files in `[logs_folder]/YYYY/MM/` matching `YYYY-MM-DD-session-*.md`
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

Create `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`:

```markdown
---
tags: [session-log]
date: YYYY-MM-DD
session: NN
---

# Session Summary : [Month DD, YYYY] (Session N)

## What We Worked On

[1-3 sentences describing the session's focus]

## Key Decisions

- [Decision 1]
- [Decision 2]

## Insights & Learnings

- [Insight 1]
- [Insight 2]

## What Worked / Didn't Work

- ✅ [Something that worked well]
- ❌ [Something that didn't work or slowed things down]

_Omit this section if the session had no notable friction or technique worth logging._

## Action Items

- [ ] [Action item 1] 📅 YYYY-MM-DD
- [ ] [Action item 2] 📅 YYYY-MM-DD

## Open Questions

- [Question or uncertainty to revisit]
```

After writing the session log, reset the checkpoint hook counter to prevent spurious post-wrapup checkpoints:

```bash
tmpdir_safe="${TMPDIR:-${TEMP:-${TMP:-/tmp}}}"
if [ -n "${WT_SESSION:-}" ]; then
  _token=$(printf '%s' "$WT_SESSION" | tr -cd 'a-zA-Z0-9' | cut -c1-8)
elif [ -n "${PPID:-}" ] && [ "${PPID}" -gt 1 ] 2>/dev/null; then
  _token="${PPID}"
elif command -v powershell.exe &>/dev/null; then
  _token=$(powershell.exe -NoProfile -NonInteractive -Command '(Get-Process -Id $PID).Parent.Id' 2>/dev/null | tr -d '\r\n ')
else
  _f="${tmpdir_safe}/ob1-$(date +%Y-%m-%d).sid"
  [ -f "$_f" ] || printf '%05d' "$(( RANDOM % 90000 + 10000 ))" > "$_f" 2>/dev/null
  _token=$(cat "$_f" 2>/dev/null || echo '99999')
fi
[ -n "${_token:-}" ] && echo "0:$(date +%s)" > "${tmpdir_safe}/onebrain-${_token}.state" 2>/dev/null
```

This writes `0:<epoch>` into the state file, triggering a 60-second skip window and resetting the message counter.

---

## Step 5: Mark Checkpoints as Merged

If the Step 1 checkpoint list is non-empty (i.e., at least one file was read and incorporated):

For each checkpoint file path stored in Step 1:
1. Read the file's frontmatter
2. Set `merged: true` : handle all variants:
   - `merged: false` → replace with `merged: true`
   - `merged: null` or bare `merged:` → replace with `merged: true`
   - key absent → add `merged: true` to frontmatter
3. Write the updated file

**Why write before deleting:** Always complete Step 5 (mark merged) before Step 6 (delete). If the write fails, `merged: true` is never set and future /wrapup runs will correctly re-include the checkpoint. Deleting first would lose checkpoint data permanently with no recovery path.

This prevents /wrapup from re-reading the same checkpoints in future sessions.

---

## Step 6: Checkpoint Cleanup

After session log is written successfully:
1. Delete checkpoint files merged into this session's log
2. Safety-net scan: collect the union of (a) the two month paths from Step 1b (current month and previous month), and (b) the unique YYYY/MM directories that any recovered orphan group lived in. For each path in this union, glob `*-checkpoint-*.md` and delete any with `merged: true` that were not already deleted above.

Guard: only delete AFTER confirming session log write succeeded. Never delete before or during write.

---

## Step 7: Recap Reminder

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

## Step 8: Confirm

Say:
──────────────────────────────────────────────────────────────
💾 Session Saved
──────────────────────────────────────────────────────────────
`[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`

I logged {N} action items — they'll appear in your Tasks view.
(omit this line if no action items)

Auto-recovered {S} orphan session(s):
  {YYYY-MM-DD} → `session-NN.md` ({C} checkpoints)
(omit this block if none recovered)

{Recap reminder message from Step 7}

Good session! See you next time.

---

## In-Skill Examples

**Good Key Decisions section** (enough detail to reconstruct what happened):
```markdown
## Key Decisions

- Chose $PPID as session token because it is stable within a shell session and unique per terminal window
- Moved checkpoint delete to AFTER merged: true write — prevents data loss if write fails
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

- **Session token mismatch on Mac.** `$PPID` changes if the session was started from a wrapper (Hammerspoon, tmux `new-session`, etc.). If Step 1 finds no checkpoints but you expect some, compare `$PPID` against the date-matching checkpoint filenames in the folder to find the actual token used when they were written.

- **Cross-month midnight sessions.** If a session starts before midnight and /wrapup runs after midnight in a new month, Step 1 looks in "yesterday's folder." Decrementing the month is sufficient for all months except January — for January specifically, also roll back the year (e.g., January 1 → December of the prior year). All other month boundaries only need the month decremented.

- **`merged: false` YAML type.** Some YAML parsers return the string `"false"` rather than boolean `false`. The filter "keep where `merged` is absent or not `true`" should treat both `merged: false` (boolean) and `merged: "false"` (string) as "not merged" — only exact `merged: true` counts.

- **Duplicate session slot collision.** If auto-save and a manual /wrapup run nearly simultaneously, both may try to write `session-01.md`. Step 2 already verifies the slot is free before writing — do not skip this check even when synthesizing from checkpoints.
