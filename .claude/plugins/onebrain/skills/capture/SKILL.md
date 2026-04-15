---
name: capture
description: "Quick note capture with automatic wikilink suggestions to related existing notes"
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
| Fleeting note / rough idea | `[inbox_folder]/YYYY-MM-DD-[slug].md` |
| Personal insight / synthesis | `[knowledge_folder]/[best-subfolder]/[Topic Name].md` |
| External reference / source | `[resources_folder]/[best-subfolder]/[Topic Name].md` |
| Ongoing responsibility | `[areas_folder]/[best-subfolder]/[Topic Name].md` |
| Project update | append to `[projects_folder]/[subfolder]/[Project Name].md` |

**For subfolders:** glob existing subfolders in the target folder and pick the best fit. If none match, create a new kebab-case name (1–2 words). Do not ask : decide and proceed.

---

## Step 3: Find and Link Related Notes

Search for related notes (use qmd if available, otherwise Glob `[knowledge_folder]/**/*.md`, `[resources_folder]/**/*.md`, `[areas_folder]/**/*.md`, `[projects_folder]/**/*.md`). Exclude the destination file. Include top 1–3 as wikilinks automatically. Omit `## Related` if nothing relevant found.

---

## Step 4: Create the Note

**For inbox (fleeting note):**

File: `[inbox_folder]/YYYY-MM-DD-[slug].md`

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

## Step 5: Suggest Links (background)

After writing, dispatch a background sub-agent (`run_in_background: true`, `mode: "bypassPermissions"`) using the Link Suggester agent with:
- `new_note_path` : the path of the file just written (relative to vault_root)
- `new_note_content` : the content just written
- `vault_root` : absolute path to the directory containing vault.yml
- `knowledge_folder`, `resources_folder`, `areas_folder`, `projects_folder` : from INSTRUCTIONS.md config

The main agent proceeds to the Confirm step immediately — do not wait for the link suggester.

---

## Step 6: Confirm

Say in one line:
> Captured to `[file path]`. [If links added: Linked to "Note A", "Note B".]
