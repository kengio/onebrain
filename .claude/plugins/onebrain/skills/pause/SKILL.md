---
name: pause
description: "Save a snapshot of long-running work mid-flight to resume later in a future session. Use when user signals they need to pause a long task and continue another time — 'pause this work', 'หยุดก่อน', 'step away', 'ทิ้งงานไว้ก่อน', 'ค่อยมาทำต่อ'. Writes a packet to 07-logs/pause/ but does NOT end the session or clear context. Do NOT use for: ending a session (use /wrapup), capturing a single idea (use /capture), saving a memory (use /learn)."
schedulable: false
---

# /pause — Save Long-Task Snapshot (TL;DR)

Writes a per-thread snapshot of the current work to `[logs_folder]/pause/` so the next session can `/resume` and pick up seamlessly. Multiple pause files accumulate across days for the same task; `/wrapup` later consolidates them all into one session log.

**Mental model:** `/pause` = SAVE snapshot. It does NOT end the session and does NOT clear context. User runs `/clear` manually when ready to free context.

---

## Scope

- /pause writes pause snapshot files only. It does NOT touch checkpoints, session logs, MEMORY.md, or memory/ files.
- It DOES update the pointer file `[logs_folder]/pause/_active.md` to set/confirm the active thread slug.

---

## Step 1: Determine Active Thread Slug

1. Read `[logs_folder]/pause/_active.md` if present. The file is plain text — one line — containing a kebab-case slug.
2. If the file exists and is non-empty: use that slug as `active_slug`.
3. If absent / empty:
   - Agent reviews session context → propose a kebab-case slug from the dominant topic (e.g. `cli-refactor`, `oracle-borrows`)
   - Use `AskUserQuestion` to confirm. Question: "Active thread name? Suggested: `<proposed-slug>`" with options: (a) accept suggestion, (b) type a different slug
   - On confirmation, set `active_slug = <chosen>` and continue
4. If `/pause --task=<slug>` was invoked with an explicit slug:
   - If `_active.md` is empty or contains the same slug → set `active_slug = <slug>`, skip warning
   - If `_active.md` contains a different slug → use `AskUserQuestion`: "⚠️ Active thread: `<existing>` (N unmerged snapshots). Switch to `<new>`? (y/N)". On `y` → set `active_slug = <new>`. On `n` → abort silently with message "Pause aborted — active thread unchanged."

---

## Step 2: Compute Next NN

1. Glob `[logs_folder]/pause/*-{active_slug}-pause-*.md` (no date filter — NN is scoped to slug across all dates).
2. Parse the `NN` segment (the two-digit number before `.md`) from each filename.
3. `next_nn` = `max(NN parsed) + 1`. If no files → `next_nn = 01`. Always zero-pad to 2 digits.

---

## Step 3: Generate Snapshot Content

Review the current conversation since the last pause file of `active_slug` (or since session start if none). Fill the body sections following `skills/startup/references/session-formats.md` → Pause File Format.

**Required sections (in order):**

- `## Where I Stopped` — 1–2 sentences: file being edited, decision pending, last test run, current focus
- `## Resume With` — one concrete next action: specific file path, command, decision point. Must be actionable as the FIRST thing on resume
- `## What We Worked On` — 2–3 sentences describing the pause-interval's focus
- `## Key Decisions` — bullet list (every unique decision since last pause, full detail)
- `## Insights & Learnings` — omit if none
- `## Action Items` — `- [ ] task 📅 YYYY-MM-DD` format
- `## Open Questions` — omit if none

**Word cap:** 350 words total. Preservation rule: every unique decision/action/question since last pause MUST appear — deduplication only, no summarization.

---

## Step 4: Write the Pause File

1. Today's date as `YYYY-MM-DD`.
2. Ensure directory exists: `mkdir -p [logs_folder]/pause/`
3. Get `session_token` from agent context (run `onebrain session-init` to recover if missing).
4. Write to `[logs_folder]/pause/YYYY-MM-DD-{active_slug}-pause-{next_nn}.md`:

```yaml
---
tags: [pause, session-log]
date: YYYY-MM-DD
session_token: <token>
task_slug: <active_slug>
pause: <NN>
trigger: manual
---
```

Followed by the body sections from Step 3.

---

## Step 5: Update Active Pointer

Write `[logs_folder]/pause/_active.md` with a single line: the `active_slug` value (no trailing newline issues — overwrite is idempotent if slug already matches).

---

## Step 6: Confirm

Output exactly this format (Capture profile — 1 confirmation block, no elaboration):

```
💾 Snapshot saved: 07-logs/pause/YYYY-MM-DD-{slug}-pause-NN.md
📂 Active thread: {slug} (N snapshots)

คุยต่อได้เลย — ยังไม่ตัด context.
พิมพ์ /clear เมื่อพร้อมพักงาน (packet จะรอ session ถัดไป)
```

Where `N` is the total count of pause files for `active_slug` after this write.

---

## Auto-Finalize (Called by AUTO-SUMMARY and /wrapup "n" branch)

When AUTO-SUMMARY or `/wrapup` "n" branch needs to finalize an active thread before writing a daily session log, it calls into this skill's auto-finalize path. Three skip conditions — if ANY is true, skip:

1. **No-activity:** Glob `[logs_folder]/checkpoint/*-{current_session_token}-checkpoint-*.md` — if empty, the session produced no work; skip.
2. **Already-captured-this-session:** Find the latest pause file of `active_slug`. If its frontmatter `session_token` equals current session token AND no checkpoint file mtime > pause file mtime, the current session's work is already captured by an earlier `/pause`; skip.
3. **No-pause-files-and-untouched:** If no pause file exists yet for `active_slug` AND the newest checkpoint mtime is older than `_active.md` mtime, the slug was set but no thread activity occurred; skip.

If not skipped: run Steps 2–5 above, but in Step 4 frontmatter use `trigger: auto-finalize` instead of `manual`, and in Step 3's `## Where I Stopped` prepend "Auto-finalized at session end. " to the human-readable text.

No Step 6 confirm — auto-finalize is silent.
