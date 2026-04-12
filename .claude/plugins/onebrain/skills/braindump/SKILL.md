---
name: braindump
description: Capture a stream of raw thoughts : classify them and file to inbox with action items extracted
---

# Braindump

Capture everything on your mind right now. Don't filter : just say it.

---

## Step 1: Invite the Dump

Say:
> Go for it : what's on your mind? Dump everything. I'll sort it out.

Wait for the user to share their thoughts. Don't interrupt.

---

## Step 2: Classify the Content

Silently analyze and classify each item:

| Type | Description | Destination |
|------|-------------|-------------|
| **Task** | Something to do | Extract as task with date |
| **Idea** | Creative or speculative thought | File to inbox |
| **Note** | Fact, reference, or information | File to inbox |
| **Project** | Something needing a dedicated note | Create/update in 01-projects/ |
| **Question** | Open question or uncertainty | File to inbox with `?` tag |
| **Feeling/Reflection** | Personal reflection or emotion | File to inbox |

---

## Step 3: Create Inbox File

File immediately : do not ask for confirmation first.

Create `00-inbox/YYYY-MM-DD-braindump.md` (append `-2`, `-3` if file exists):

```markdown
---
tags: [inbox, braindump]
created: YYYY-MM-DD
---

# Braindump : [Month DD, YYYY]

## Raw Thoughts

[Full text of what the user shared, lightly formatted]

## Extracted Tasks

- [ ] [task 1] 📅 YYYY-MM-DD
- [ ] [task 2] 📅 YYYY-MM-DD

## Ideas

- [idea 1]

## Notes & References

- [note 1]

## Open Questions

- [question]?

## Related Notes

[[Link to relevant existing notes if any]]
(Omit this section if no related notes are found)
```

---

## Step 4: Check for Project Links

If any item is a direct update, task, or decision for an active project in MEMORY.md (not a passing mention), append a brief note to that project file automatically. Mention it in the confirmation.

---

## Step 5: Confirm

Say in one line:
> Filed to `00-inbox/YYYY-MM-DD-braindump.md`. [If tasks: Extracted N tasks.] [If project link: Added note to "Project".]
