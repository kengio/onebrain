---
name: connect
description: "Find connections between notes and suggest wikilinks to strengthen the knowledge graph. Use when the user wants to discover how existing notes relate to each other — 'find connections', 'what links to this note', 'strengthen my graph'. Do NOT use for: creating new notes (use capture), processing inbox (use consolidate), or searching for specific content (search directly)."
---

# Connect

Find meaningful connections between your notes and suggest wikilinks to build a richer knowledge graph.

---

## Step 1: Scope

Ask (or infer from context):

AskUserQuestion:
- question: "What scope do you want to search for connections?"
- header: "Connect Scope"
- multiSelect: false
- options:
  - label: "specific note", description: "Find connections for a specific note (you'll name it)"
  - label: "entire knowledge base", description: "Scan all projects, areas, knowledge, and resources"
  - label: "recently added", description: "Notes added in the last 7 days"

---

## Step 2: Scan Notes

Use qmd if available for semantic search across notes; fallback: Glob `[projects_folder]/**/*.md`, `[areas_folder]/**/*.md`, `[knowledge_folder]/**/*.md`, `[resources_folder]/**/*.md`. For each note, extract:
- Title
- Tags (from frontmatter)
- Key concepts mentioned (first 200 words)
- Existing wikilinks already present

If the total note count exceeds 20, delegate to the **Knowledge Linker** agent instead — see Step 2b.

---

## Step 2b: Delegate to Agent (>20 Notes)

If more than 20 notes are in scope: dispatch the **Knowledge Linker** agent (`agents/knowledge-linker.md`) as a foreground sub-agent (`run_in_background: false`, `mode: "bypassPermissions"`), passing `vault_root`, `knowledge_folder`, `resources_folder`, `areas_folder`, and `projects_folder`. The agent always scans the full vault regardless of the scope chosen in Step 1. Proceed to Step 4 immediately (the agent's output replaces Step 3).

For ≤20 notes: continue with Step 3.

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
──────────────────────────────────────────────────────────────
🔗 Connect — {N} suggestions found
──────────────────────────────────────────────────────────────
[{n}/{N}] `{Note A}` → `{Note B}`
  Type: {connection type}
  Reason: {reason}
  Add to `{Note A}`:
    Near "...{nearby text}..." → add [[{Note B}]]
```

No suggestions:
```
✅ No connections found — notes are already well-linked.
```

Maximum 10 suggestions. Ask user to approve each batch before implementing.

If more than 10 suggestions found, show first 10 and add:
  (showing 10 of {M} — run /connect again to see more)

---

## Step 5: Implement Approved Links

For each approved suggestion:
- Read the source note
- Find the suggested location (by nearby text)
- Add the wikilink inline or in a "## Related" section at the bottom

After implementing:
✅ Added [[{Note B}]] link to `{Note A}`.

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

## Known Gotchas

- **"Entire knowledge base" scope can be very large.** If note count exceeds 20, Step 2b delegates to the Knowledge Linker agent — the inline Steps 3-4 path is only for small scopes. Do not try to hold hundreds of notes in context.

- **Avoid suggesting wikilinks that already exist.** Before proposing a connection between Note A and Note B, check whether `[[Note B]]` (or `[[Note B|...]]`) already appears anywhere in Note A. Suggesting existing links adds noise without value.

