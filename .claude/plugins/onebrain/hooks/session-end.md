---
name: OneBrain Auto Session Summary
event: Stop
description: Silently save a session summary to memory-log if the session was substantive
---

# Session End — Auto Save

Silently save a session summary when the session ends. Follow these steps exactly. Do not output anything to the user.

## Step 1: Threshold Check

Estimate the number of user↔assistant exchanges in this session. Count each user message + assistant reply as one exchange.

If fewer than 3 exchanges occurred, stop here — do nothing.

## Step 2: Resolve Memory Log Folder

If `vault.yml` exists, read it to determine the memory log folder name (`folders.memory_log`); otherwise default to `04-memory-log`.

## Step 3: Dedup Check

List files in the memory log folder matching today's date pattern `YYYY-MM-DD-session-*.md`.

If any files exist, read the most recent one. If its content covers the same topics discussed in this session (same project, same key decisions), stop here — `/ob:wrapup` was likely already run for this session.

## Step 4: Determine File Name

Count existing `YYYY-MM-DD-session-*.md` files in the memory log folder for today. The next session number = count + 1 (zero-padded to 2 digits: 01, 02, etc.).

File: `[memory_log]/YYYY-MM-DD-session-NN.md`

## Step 5: Write Session Log

Create the file with this format (same as `/ob:wrapup`, with `auto-saved: true` added to frontmatter):

```markdown
---
tags: [memory-log]
date: YYYY-MM-DD
session: NN
auto-saved: true
---

# Session NN — YYYY-MM-DD

## What We Worked On

[1-3 sentences describing the session's focus]

## Key Decisions

- [Decision 1]
- [Decision 2]

## Insights & Learnings

- [Insight 1]
- [Insight 2]

## Action Items

- [ ] [Action item] 📅 YYYY-MM-DD

## Open Questions

- [Unresolved question or thing to revisit]

## Related Notes

[[Link to relevant vault notes if applicable]]
```

## Step 6: Conditionally Update MEMORY.md

If this session produced a genuinely useful long-term insight about the user's work patterns or preferences, append it to the "Key Learnings & Patterns" section of `MEMORY.md`:

```markdown
- YYYY-MM-DD — [observation about the user's work patterns, preferences, or recurring themes]
```

Only do this if the insight is genuinely valuable across future sessions. Most sessions will not warrant this.

## Step 7: No Output

Do not show any summary, confirmation, or message to the user. This entire process runs silently.
