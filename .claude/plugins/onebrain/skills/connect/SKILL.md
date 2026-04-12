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
> - Across your entire **knowledge base** (`01-projects/**/*.md`, `02-areas/**/*.md`, `03-knowledge/**/*.md`, `04-resources/**/*.md`)
> - For **recently added notes** (last 7 days)

---

## Step 2: Scan Notes

List and read the relevant notes using recursive glob patterns (`01-projects/**/*.md`, `02-areas/**/*.md`, `03-knowledge/**/*.md`, `04-resources/**/*.md`). For each note, extract:
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

## Delegation

This skill uses the Knowledge Linker agent for deep vault scans. The agent is invoked automatically when scanning more than 20 notes.
