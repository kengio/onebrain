---
name: connect
description: Find connections between notes and suggest wikilinks to strengthen the knowledge graph
---

# Connect

Find meaningful connections between your notes and suggest wikilinks to build a richer knowledge graph.

---

## Step 1: Scope

Ask (or infer from context):
> Do you want to find connections:
> - For a **specific note** (name it)
> - Across your entire **knowledge base** (`[projects_folder]/**/*.md`, `[areas_folder]/**/*.md`, `[knowledge_folder]/**/*.md`, `[resources_folder]/**/*.md`)
> - For **recently added notes** (last 7 days)

---

## Step 2: Scan Notes

Use qmd if available for semantic search across notes; fallback: Glob `[projects_folder]/**/*.md`, `[areas_folder]/**/*.md`, `[knowledge_folder]/**/*.md`, `[resources_folder]/**/*.md`. For each note, extract:
- Title
- Tags (from frontmatter)
- Key concepts mentioned (first 200 words)
- Existing wikilinks already present

---

## Step 3: Find Connections

Look for:

| Connection Type | Description |
|----------------|-------------|
| **Conceptual overlap** | Both notes discuss the same idea |
| **Cause-effect** | One note explains why something in another happens |
| **Elaboration** | One note goes deeper on a concept mentioned in another |
| **Contrast** | Notes present different perspectives on the same topic |
| **Sequence** | Notes form a natural progression of ideas |
| **Application** | One note shows how to apply a concept from another |

---

## Step 4: Present Suggestions

Group suggestions by note. For each suggestion, show:

```
## Note A → Note B
Type: Conceptual overlap
Reason: Both discuss [shared concept]
Suggested addition to "Note A":
  Near "...existing text..." → add "Note B"
```

Maximum 10 suggestions. Ask user to approve each batch before implementing.

---

## Step 5: Implement Approved Links

For each approved suggestion:
- Read the source note
- Find the suggested location (by nearby text)
- Add the wikilink inline or in a "## Related" section at the bottom

After implementing:
> Added "Note B" link to "Note A".

---

## Step 6: Offer Orphan Report

After connecting, optionally run:
> Want me to list notes with no outbound links? These "orphan" notes might be missing connections.

List them if yes, let user decide what to do.

---

## Step 7: Offer Typed Relationship Frontmatter

Skip this step if no wikilinks were approved or implemented in Step 5.

After implementing approved wikilinks, use AskUserQuestion to offer typed relationship frontmatter:

> Want me to also add typed relationship properties to the frontmatter of connected notes? This makes connections machine-readable and shows relationship types in Obsidian Graph View. (yes / no)

If user agrees:
- For each connection found, determine the best relationship type: `uses`, `depends_on`, `contradicts`, `supersedes`, `caused_by`
- Read the source note's frontmatter
- Add or append to the appropriate property list
- Do not duplicate existing entries (check current frontmatter before writing)

---

## Step 8: Batch Retro-tag Mode

If the user asks to retro-tag existing notes (e.g. "update all notes in 01-projects/onebrain/"):
- Glob the target folder for `.md` files
- For each note: read content + existing frontmatter
- Suggest typed relationships based on existing wikilinks and content
- Present suggestions in batches of 5, ask for approval before writing
- Before writing, check existing frontmatter properties and skip any relationship already present to avoid duplicates
- Write approved typed relationships to frontmatter

---

## Delegation

This skill uses the Knowledge Linker agent for deep vault scans. The agent is invoked automatically when scanning more than 20 notes.
