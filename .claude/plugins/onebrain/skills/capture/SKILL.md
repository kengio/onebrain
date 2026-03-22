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
- **Knowledge note** → file to `03-knowledge/` (personal synthesis, insight, processed idea)
- **Reference note** → file to `04-resources/` (external source, fact, quote, reference material)
- **Area note** → file to `02-areas/` (ongoing responsibility — health, finances, career...)
- **Project note** → append to relevant `01-projects/` file

Ask if unclear:
> Is this a rough idea to process later, your own synthesized insight, reference material from an external source, something related to an ongoing area of responsibility, or a project update?

---

## Step 3: Choose Subfolder

**Skip this step for fleeting notes going to `00-inbox/`.**

For knowledge notes (`03-knowledge/`), reference notes (`04-resources/`), area notes (`02-areas/`), or project notes (`01-projects/`):

1. Glob existing subfolders in the target folder (e.g. `03-knowledge/*/`, `04-resources/*/`, or `02-areas/*/`)
2. Analyze the content to determine the best category
3. Suggest a subfolder path (kebab-case, max 2 levels, e.g. `programming/python`):
   - If an existing subfolder fits well → suggest it
   - If none match → suggest a new name (1-2 short words, hyphenated)
4. Present to user:
   > I'd file this under `[target-folder]/[suggested-path]/`. Sound good?
   > Existing folders: [list]
5. Use the confirmed path. Subfolder naming rules: all lowercase, hyphens not spaces, max 2 levels.

---

## Step 4: Find Related Notes

Scan `03-knowledge/**/*.md`, `04-resources/**/*.md`, and `01-projects/**/*.md` for notes related to the content (by topic/tags/title).

List up to 3 relevant matches and ask:
> I found these related notes — should I link to any of them?
> - [[Note A]] — [why it's related]
> - [[Note B]] — [why it's related]

---

## Step 5: Create the Note

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

**For knowledge note (`03-knowledge/`) or reference note (`04-resources/`):**

File: `[target-folder]/[subfolder]/[Topic Name].md` (target folder and subfolder confirmed in Steps 2–3)

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

Append to `01-projects/[subfolder]/[Project Name].md` (subfolder confirmed in Step 3):

```markdown

## [Date] — [Brief heading]

[Content]

Related: [[Link 1]]
```

---

## Step 6: Confirm

Say:
> Captured to `[file path]`.
> [If links added]: Linked to [[Note A]] and [[Note B]].
>
> Anything else to add?
