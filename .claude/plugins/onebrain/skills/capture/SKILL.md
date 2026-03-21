---
name: capture
description: Quick note capture with automatic wikilink suggestions to related existing notes
---

# Capture

Quickly capture a note, idea, reference, or piece of information — with automatic linking to related notes.

---

## Step 1: Ask What to Capture

If the user invoked `/capture` without content, ask:
> What do you want to capture?

If they provided content after `/capture [content]`, use that directly.

---

## Step 2: Determine Note Type

Classify the content:
- **Fleeting note** → file to `00-inbox/` (unprocessed idea, rough thought)
- **Reference note** → file to `02-knowledge/` (fact, quote, resource)
- **Project note** → append to relevant `01-projects/` file

Ask if unclear:
> Is this a rough idea to process later, or a reference you want in your knowledge base?

---

## Step 3: Find Related Notes

Scan `02-knowledge/` and `01-projects/` for notes related to the content (by topic/tags/title).

List up to 3 relevant matches and ask:
> I found these related notes — should I link to any of them?
> - [[Note A]] — [why it's related]
> - [[Note B]] — [why it's related]

---

## Step 4: Create the Note

**For inbox (fleeting note):**

File: `00-inbox/YYYY-MM-DD-[slug].md`

```markdown
---
tags: [inbox]
created: YYYY-MM-DD
---

# [Title derived from content]

[Content]

## Related

[[Link 1]]
[[Link 2]]
```

**For knowledge base (reference note):**

File: `02-knowledge/[Topic Name].md`

If the file already exists, append a new section. If not, create it:

```markdown
---
tags: [topic-tag]
created: YYYY-MM-DD
---

# [Topic Name]

[Content]

## Related

[[Link 1]]
```

**For project note:**

Append to `01-projects/[Project Name].md`:

```markdown

## [Date] — [Brief heading]

[Content]

Related: [[Link 1]]
```

---

## Step 5: Confirm

Say:
> Captured to `[file path]`.
> [If links added]: Linked to [[Note A]] and [[Note B]].
>
> Anything else to add?
