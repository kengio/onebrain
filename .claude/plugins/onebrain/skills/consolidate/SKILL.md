---
name: consolidate
description: Review inbox and recent notes, synthesize and merge into the knowledge base
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
> 1. `2026-03-20-braindump.md` · ideas about [topic], 2 tasks
> 2. `2026-03-19-capture.md` · note about [topic]
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
- What type of knowledge this is (insight, reference, idea, project note, area)
- What existing notes it relates to (search `03-knowledge/**/*.md`, `04-resources/**/*.md`, `01-projects/**/*.md`, and `02-areas/**/*.md`)
- Whether it deserves its own note or should be merged into an existing one

### 3b. Decide Destination

**Primary signal (check first):** If the inbox item has a `source:` frontmatter field matching `/research`, `/summarize`, or `/reading-notes`, route it directly to `04-resources/` · no judgment needed.

**Secondary signal (for all other notes):** Apply the content-type rule below.

Classify the item and route it to the appropriate folder:
- **Your own synthesis, insight, or conclusion** → `03-knowledge/[subfolder]/`
- **Reference material, external info, or source notes** → `04-resources/[subfolder]/`
- **Project-specific work** → `01-projects/[subfolder]/`
- **Ongoing responsibility (something you maintain over time, not a one-time insight)** → `02-areas/` · examples: health tracking, finances, career development, relationships

Confirm routing with the user for the first 3 items. After that, proceed autonomously · or if the user says 'stop and confirm', return to confirmation mode for the next item.
> `[filename]`: This looks like [classification] · I'd route it to `[destination-folder]/`. Does that work, or would you prefer a different folder?

Also show merge options if relevant:
> I'd merge this into [[Existing Note]] · it adds context about [topic].
> Or I could create a new note: `[[New Note Name]]`.
> What do you prefer?

**Mixed-content notes:** If a single inbox item contains content that belongs in multiple folders (e.g., a braindump with both personal insights and project tasks), offer to split it: create separate notes for each content type, each routed to its correct folder. Ask the user to confirm before splitting.

### 3b.5 Choose Subfolder (for new notes only)

Based on the routing decision above:
1. Glob existing subfolders in the target folder (`03-knowledge/*/`, `04-resources/*/`, `01-projects/*/`, or `02-areas/*/`)
2. Suggest a kebab-case subfolder based on the note's topic (max 2 levels, e.g. `science/biology`)
3. Present to user: "I'd file this under `[destination-folder]/[suggested-path]/`. OK?"
4. Use confirmed path for file creation.

### 3c. Execute
- **Merge**: Append the content as a new section in the target note, with a date header. When merging, confirm the merge target is in the same folder as the routing decision. If the best merge target is in a different folder, note this to the user and ask which should take precedence: the routing decision or the merge.
- **New note**: Create `[destination-folder]/[subfolder]/[Topic Name].md` with proper frontmatter
- **Archive**: If the item is outdated or irrelevant, move to `06-archive/YYYY/MM/`

Always add wikilinks connecting to at least one related note.

---

## Step 4: Handle Tasks

If inbox items contain unchecked tasks (`- [ ]`):
- Leave them in place (the Tasks plugin will find them wherever they live)
- Or ask: "Do you want to move the open tasks to your project notes?"

---

## Step 5: Archive Processed Items

After an inbox item has been fully processed and its content merged/filed:
- Move the original file to `06-archive/YYYY/MM/` (using today's date, don't delete it)
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
