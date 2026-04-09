---
name: wrapup
description: Wrap up and save the current session summary to the session log
---

# Session Summary (TL;DR)

Generates a summary of this session and saves it to the logs folder for future recall.

---

## Before You Begin

If `vault.yml` exists, read it and extract:
- `folders.logs` as `logs_folder` (default: `07-logs`)
- `folders.agent` as `agent_folder` (default: `05-agent`)

Use these variables for all file paths in the steps below.

---

## Step 1: Gather Checkpoint Context

1. Get today's date as `YYYY-MM-DD`. Extract `YYYY` and `MM`.
2. Glob `[logs_folder]/YYYY/MM/YYYY-MM-DD-checkpoint-*.md`
3. Filter: keep only files where frontmatter field `merged` is absent or not `true`
4. If any found: read each file — use their content as **additional context** when reviewing the session in Step 3. Unmerged checkpoints capture activity that may have been compressed out of current context.
5. Store the list of found checkpoint paths for use in Step 5.

If none found: continue normally.

---

## Step 2: Determine Session File Name

1. Get today's date: `YYYY-MM-DD`. Extract `YYYY` and `MM` (zero-padded month).
2. List files in `[logs_folder]/YYYY/MM/` matching `YYYY-MM-DD-session-*.md`
3. The next session number = count of matches + 1 (zero-padded to 2 digits: 01, 02, etc.)
4. File name: `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`

---

## Step 3: Review the Session

Reflect on the conversation that just occurred. Identify:

- **Main topic(s)** — What did we work on?
- **Key decisions made** — Any choices, directions, or conclusions reached
- **Insights or learnings** — New understanding, patterns noticed, things discovered
- **What worked / didn't work** — Approaches or tools that helped, and anything that slowed us down or failed (omit if nothing notable)
- **Action items** — Tasks to do, things to follow up on
- **Open questions** — Unresolved questions or things to investigate

---

## Step 4: Write the Session Log

Create `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`:

```markdown
---
tags: [session-log]
date: YYYY-MM-DD
session: NN
---

# Session Summary — [Month DD, YYYY] (Session N)

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

## Related Notes

[[Link to relevant vault notes if applicable]]
```

---

## Step 5: Mark Checkpoints as Merged

If checkpoints were found in Step 1:

For each checkpoint file path stored in Step 1:
1. Read the file's frontmatter
2. Replace `merged: false` with `merged: true` (add the line if absent)
3. Write the updated file

This prevents /wrapup from re-reading the same checkpoints in future sessions.

---

## Step 6: Update MEMORY.md (If Warranted)

If this session produced an insight or pattern that should persist across all future sessions, add it to the "Key Learnings & Patterns" section of `[agent_folder]/MEMORY.md`. Also update the `updated:` field in the frontmatter to today's date.

```markdown
## Key Learnings & Patterns

- YYYY-MM-DD — [observation about the user's work patterns, preferences, or recurring themes]
```

Only add learnings that are genuinely useful long-term (not every session warrants this).

---

## Step 7: Overflow to Agent Memory (Optional)

If a genuinely useful long-term insight emerged this session — a clear behavioral pattern, a strong user preference, or a non-obvious observation about how to work with this user — and it is too detailed for MEMORY.md, write it to `[agent_folder]/memory/YYYY-MM-DD-slug.md`:

- Frontmatter: `tags: [agent-memory]`, `created: YYYY-MM-DD`, `source: /wrapup`
- File naming: first note of day: `YYYY-MM-DD-slug.md`; if one already exists today: `YYYY-MM-DD-02-slug.md`, etc.
- Keep it to 1-3 sentences
- Only do this if the insight is genuinely useful long-term — do not overflow routine session details
- Use this step only when the insight was too detailed to include in `[agent_folder]/MEMORY.md` (Step 6). Do not write the same insight to both `[agent_folder]/MEMORY.md` and agent memory.

---

## Step 8: Confirm

Say:
> Session saved to `[logs_folder]/YYYY/MM/YYYY-MM-DD-session-NN.md`.
>
> [If action items]: I logged N action items — they'll appear in your Tasks view.
> [If MEMORY.md updated]: I also added a learning to `[agent_folder]/MEMORY.md`.
>
> Good session! See you next time.
