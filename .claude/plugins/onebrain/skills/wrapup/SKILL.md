---
name: wrapup
description: Wrap up and save the current session summary to the memory log
---

# Session Summary (TL;DR)

Generates a summary of this session and saves it to the memory log folder for future recall.

---

## Before You Begin

If `vault.yml` exists, read it and extract `folders.memory_log` as `memory_log_folder`. Default to `04-memory-log` if the file does not exist or the key is absent.

Use `memory_log_folder` for all file paths in the steps below.

---

## Step 1: Determine Session File Name

1. Get today's date: `YYYY-MM-DD`
2. List files in `[memory_log_folder]/` matching `YYYY-MM-DD-session-*.md`
3. The next session number = count of matches + 1 (zero-padded to 2 digits: 01, 02, etc.)
4. File name: `[memory_log_folder]/YYYY-MM-DD-session-NN.md`

---

## Step 2: Review the Session

Reflect on the conversation that just occurred. Identify:

- **Main topic(s)** — What did we work on?
- **Key decisions made** — Any choices, directions, or conclusions reached
- **Insights or learnings** — New understanding, patterns noticed, things discovered
- **Action items** — Tasks to do, things to follow up on
- **Open questions** — Unresolved questions or things to investigate

---

## Step 3: Write the Session Log

Create `[memory_log_folder]/YYYY-MM-DD-session-NN.md`:

```markdown
---
tags: [memory-log]
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

## Action Items

- [ ] [Action item 1] 📅 YYYY-MM-DD
- [ ] [Action item 2] 📅 YYYY-MM-DD

## Open Questions

- [Question or uncertainty to revisit]

## Related Notes

[[Link to relevant vault notes if applicable]]
```

---

## Step 4: Update MEMORY.md (If Warranted)

If this session produced an insight or pattern that should persist across all future sessions, add it to the "Key Learnings & Patterns" section of `MEMORY.md`:

```markdown
## Key Learnings & Patterns

- YYYY-MM-DD — [observation about the user's work patterns, preferences, or recurring themes]
```

Only add learnings that are genuinely useful long-term (not every session warrants this).

---

## Step 5: Confirm

Say:
> Session saved to `[memory_log_folder]/YYYY-MM-DD-session-NN.md`.
>
> [If action items]: I logged N action items — they'll appear in your Tasks view.
> [If MEMORY.md updated]: I also added a learning to MEMORY.md.
>
> Good session! See you next time.
