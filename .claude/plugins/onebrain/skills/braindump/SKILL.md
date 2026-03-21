---
name: braindump
description: Capture a stream of raw thoughts — classify them and file to inbox with action items extracted
triggers:
  - /ob:braindump
  - ob:braindump
---

# Braindump

Capture everything on your mind right now. Don't filter — just say it.

---

## Step 1: Invite the Dump

Say:
> Go for it — what's on your mind? Dump everything. I'll sort it out.

Wait for the user to share their thoughts. They might write a few sentences or several paragraphs. Don't interrupt.

---

## Step 2: Classify the Content

After they've finished, silently analyze the content and classify each item into:

| Type | Description | Destination |
|------|-------------|-------------|
| **Task** | Something to do | Extract as task with date |
| **Idea** | Creative or speculative thought | File to inbox |
| **Note** | Fact, reference, or information | File to inbox or knowledge |
| **Project** | Something that needs a dedicated note | Create/update in 01-projects/ |
| **Question** | Open question or uncertainty | File to inbox with `?` tag |
| **Feeling/Reflection** | Personal reflection or emotion | File to inbox |

---

## Step 3: Show Classification

Present a quick summary before filing:

> Here's what I heard:
> - **2 tasks** — I'll extract these with due dates
> - **1 idea** about [topic]
> - **1 note** about [topic]
>
> Shall I file these to your inbox? (or say "adjust" to change anything)

Wait for confirmation or adjustments.

---

## Step 4: Create Inbox File

Create a file in `00-inbox/` named `YYYY-MM-DD-braindump.md` (use today's date; if a file with that name exists, append `-2`, `-3`, etc.).

```markdown
---
tags: [inbox, braindump]
created: YYYY-MM-DD
---

# Braindump — [Month DD, YYYY]

## Raw Thoughts

[Full text of what the user shared, lightly formatted]

## Extracted Tasks

- [ ] [task 1] 📅 YYYY-MM-DD
- [ ] [task 2] 📅 YYYY-MM-DD

## Ideas

- [idea 1]
- [idea 2]

## Notes & References

- [note 1]

## Open Questions

- [question]?

## Related Notes

[[Link to relevant existing notes if any]]
```

---

## Step 5: Check for Project Links

If any item mentions an active project from MEMORY.md:
- Mention it: "This looks related to [Project] — want me to also add a note there?"
- If yes, append a brief note to the relevant `01-projects/` file

---

## Step 6: Confirm and Suggest Next

Say:
> Filed to `00-inbox/YYYY-MM-DD-braindump.md`.
> [If tasks were extracted]: I extracted N tasks — they'll show up in your Tasks view.
>
> Anything else on your mind, or shall we dive into something from this dump?
