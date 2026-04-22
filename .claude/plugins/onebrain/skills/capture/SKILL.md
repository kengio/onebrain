---
name: capture
description: "Quick note capture with automatic wikilink suggestions to related existing notes. Use when the user wants to save a single, specific, titled idea, insight, or piece of information to the vault. Do NOT use for: unstructured multi-thread thought dumps (use braindump), saving a URL for later (use bookmark), deeply summarizing an article or URL (use summarize), processing a book (use reading-notes), or teaching the agent a preference (use learn)."
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

[[Wikilink found in Step 3]]
[[Wikilink found in Step 3]]
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

[[Wikilink found in Step 3]]
```

**For project note:**

Append to the existing project file:

```markdown

## [Date] : [Brief heading]

[Content]

Related: [[Wikilink found in Step 3]]
```

---

## Step 5: Suggest Tags (background)

After writing, dispatch the **Tag Suggester** agent (`agents/tag-suggester.md`) as a background sub-agent (`run_in_background: true`, `mode: "bypassPermissions"`), passing `new_note_path`, `new_note_content`, `vault_root`, `knowledge_folder`, `resources_folder`, `areas_folder`, and `projects_folder`. Proceed to Confirm immediately.

---

## Known Gotchas

- **Project notes: always append, never overwrite.** Even if an existing project file looks sparse, create a new `## [Date] : [heading]` section rather than replacing content. Overwriting destroys project history.

- **qmd may lag on fresh notes.** If qmd returns 0 results for wikilink suggestions immediately after creating a note, fall back to Glob — the PostToolUse hook updates the index after each write, so the very latest file may not yet be searchable.

- **Knowledge vs. resources classification edge case.** "My conclusion after reading external docs" → knowledge (personal synthesis). "What the docs themselves say" → resources (external reference). When content is a direct restatement of an external source, route to resources even if it feels like an original insight.

- **Subfolder creation.** Prefer an existing subfolder over creating a new one with the same or similar topic. Glob existing subfolders before proposing a new name.

## In-Skill Examples

**Routing decisions by input:**

| Input | Type | Destination |
|-------|------|-------------|
| "checkpoint write-before-delete ordering is critical" | personal insight | `03-knowledge/onebrain/Checkpoint Write Ordering.md` |
| "found this Obsidian PKM article" | external reference | `04-resources/productivity/Obsidian PKM Methods.md` |
| "just started the Mac Mini research project" | project update | append to `01-projects/hardware/Mac Mini.md` |
| "quick thought: maybe use $PPID for session tokens" | fleeting idea | `00-inbox/YYYY-MM-DD-ppid-session-tokens.md` |

---

## Step 6: Confirm

Say in one line:
📝 Captured to `[file path]`.
