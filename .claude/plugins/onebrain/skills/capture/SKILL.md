---
name: capture
description: Quick note capture with automatic wikilink suggestions to related existing notes
---

# Capture

Quickly capture a note, idea, reference, or piece of information : with automatic linking to related notes.

---

## Step 1: Ask What to Capture

If the user invoked `/capture` without content, ask:
> What do you want to capture?

If they provided content after `/capture [content]`, use that directly.

---

## Step 2: Determine Note Type and Location

Classify the content : do not ask, infer from context:

| Type | Destination |
|------|-------------|
| Fleeting note / rough idea | `00-inbox/YYYY-MM-DD-[slug].md` |
| Personal insight / synthesis | `03-knowledge/[best-subfolder]/[Topic Name].md` |
| External reference / source | `04-resources/[best-subfolder]/[Topic Name].md` |
| Ongoing responsibility | `02-areas/[best-subfolder]/[Topic Name].md` |
| Project update | append to `01-projects/[subfolder]/[Project Name].md` |

**For subfolders:** glob existing subfolders in the target folder and pick the best fit. If none match, create a new kebab-case name (1–2 words). Do not ask : decide and proceed.

---

## Step 3: Find and Link Related Notes

Scan `03-knowledge/**/*.md`, `04-resources/**/*.md`, `02-areas/**/*.md`, and `01-projects/**/*.md` for related notes. Exclude the destination file itself. Include the top 1–3 most relevant as wikilinks in the note. Do not ask : add them automatically. If no related notes are found, omit the `## Related` section entirely.

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

**For knowledge / reference / area note:**

File: `[target-folder]/[subfolder]/[Topic Name].md`

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

Append to the existing project file:

```markdown

## [Date] : [Brief heading]

[Content]

Related: [[Link 1]]
```

---

## Step 5: Confirm

Say in one line:
> Captured to `[file path]`. [If links added: Linked to "Note A", "Note B".]
