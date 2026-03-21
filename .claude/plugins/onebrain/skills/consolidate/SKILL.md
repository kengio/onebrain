---
name: consolidate
description: Review inbox and recent notes, synthesize and merge into the knowledge base
triggers:
  - /ob:consolidate
  - ob:consolidate
---

# Consolidate

Process your inbox and recent captures into your permanent knowledge base.

---

## Step 1: Survey the Inbox

List all files in `00-inbox/` (excluding .gitkeep). For each file:
- Read the title and first few lines
- Note the date and main topics

Report:
> You have N items in your inbox:
> 1. `2026-03-20-braindump.md` — ideas about [topic], 2 tasks
> 2. `2026-03-19-capture.md` — note about [topic]
> ...

---

## Step 2: Let User Choose Scope

Ask:
> Do you want to:
> - Process **all** inbox items
> - Process items from the **last N days**
> - Process a **specific file** (name it)
> - Just **review** without moving anything

Wait for response.

---

## Step 3: Process Each Selected Item

For each item:

### 3a. Analyze
Read the file fully. Identify:
- What type of knowledge this is (insight, reference, idea, project note)
- What existing notes it relates to (search `02-knowledge/` and `01-projects/`)
- Whether it deserves its own note or should be merged into an existing one

### 3b. Decide Destination
Show the user:
> `[filename]`: I'd merge this into [[Existing Note]] — it adds context about [topic].
> Or I could create a new note: `[[New Note Name]]`.
> What do you prefer?

### 3c. Execute
- **Merge**: Append the content as a new section in the target note, with a date header
- **New note**: Create `02-knowledge/[Topic Name].md` with proper frontmatter
- **Archive**: If the item is outdated or irrelevant, move to `03-archive/`

Always add wikilinks connecting to at least one related note.

---

## Step 4: Handle Tasks

If inbox items contain unchecked tasks (`- [ ]`):
- Leave them in place (the Tasks plugin will find them wherever they live)
- Or ask: "Do you want to move the open tasks to your project notes?"

---

## Step 5: Archive Processed Items

After an inbox item has been fully processed and its content merged/filed:
- Move the original file to `03-archive/` (don't delete it)
- Or delete it if the user prefers a clean inbox

Ask preference once: "After processing, should I archive originals or delete them?"

---

## Step 6: Summary

Report:
> Inbox processed:
> - Merged N items into existing notes
> - Created N new knowledge notes: [[Note A]], [[Note B]]
> - Archived N originals
> - N tasks remain open across your vault
>
> Your inbox is [clear / down to N items].
