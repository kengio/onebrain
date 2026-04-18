---
name: consolidate
description: "Review inbox and recent notes, synthesize and merge into the knowledge base"
---

# Consolidate

Process your inbox and recent captures into your permanent knowledge base.

---

## Step 1: Survey the Inbox

List all files in `[inbox_folder]/` (excluding .gitkeep). For each file:
- Read the title and first few lines
- Note the date and main topics

Report:
──────────────────────────────────────────────────────────────
📥 Consolidate — {N} inbox items
──────────────────────────────────────────────────────────────
  1. `{filename}` — {brief description}, {N tasks} tasks
  2. `{filename}` — {brief description}

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

## Step 2.5: Pre-classify (parallel)

Before processing, dispatch one **Inbox Classifier** agent (`agents/inbox-classifier.md`) per selected inbox note in parallel (`run_in_background: false`, `mode: "bypassPermissions"`). Pass each note's `note_path`, `note_content`, `vault_root`, `knowledge_folder`, `resources_folder`, `areas_folder`, and `projects_folder`. Wait for all results before proceeding to Step 3.

Store each result as the default routing recommendation for that note. If a classifier call fails or returns an empty result, proceed without a recommendation for that note.

---

## Step 3: Process Each Selected Item

For each item:

### 3a. Analyze
Read the file fully. Use the pre-classification from Step 2.5 as the starting point. Confirm or adjust based on your own reading:
- What type of knowledge this is (insight, reference, idea, project note, area)
- What existing notes it relates to (search via qmd if available, otherwise Glob `[knowledge_folder]/**/*.md`, `[resources_folder]/**/*.md`, `[projects_folder]/**/*.md`, `[areas_folder]/**/*.md`)
- Whether it deserves its own note or should be merged into an existing one

### 3b. Decide Destination

**Primary signal (check first):** If the inbox item has a `source:` frontmatter field matching `/research`, `/summarize`, or `/reading-notes`, route it directly to `[resources_folder]/` : no judgment needed.

**Secondary signal (for all other notes):** Apply the content-type rule below.

Classify the item and route it to the appropriate folder:
- **Your own synthesis, insight, or conclusion** → `[knowledge_folder]/[subfolder]/`
- **Reference material, external info, or source notes** → `[resources_folder]/[subfolder]/`
- **Project-specific work** → `[projects_folder]/[subfolder]/`
- **Ongoing responsibility (something you maintain over time, not a one-time insight)** → `[areas_folder]/` : examples: health tracking, finances, career development, relationships

Confirm routing with the user for the first 3 items. After that, proceed autonomously : or if the user says 'stop and confirm', return to confirmation mode for the next item.

[{n}/{N}] `{filename}` looks like {classification}
  Route to `{folder}/{subfolder}/`?

Then AskUserQuestion:
- question: "How should I file this note?"
- header: "Route [{n}/{N}]"
- multiSelect: false
- options:
  - label: "confirm", description: "File as suggested"
  - label: "different folder", description: "Choose a different destination"
  - label: "merge", description: "Merge into an existing note instead"
  - label: "skip", description: "Leave in inbox for now"

Also show merge options if relevant:
> I'd merge this into "Existing Note" : it adds context about [topic].
> Or I could create a new note: "New Note Name".
> What do you prefer?

**Mixed-content notes:** If a single inbox item contains content that belongs in multiple folders (e.g., a braindump with both personal insights and project tasks), offer to split it: create separate notes for each content type, each routed to its correct folder. Ask the user to confirm before splitting.

### 3b.5 Choose Subfolder (for new notes only)

Based on the routing decision above:
1. Glob existing subfolders in the target folder (`[knowledge_folder]/*/`, `[resources_folder]/*/`, `[projects_folder]/*/`, or `[areas_folder]/*/`)
2. Suggest a kebab-case subfolder based on the note's topic (max 2 levels, e.g. `science/biology`)
3. Present to user: "I'd file this under `[destination-folder]/[suggested-path]/`. OK?"
4. Use confirmed path for file creation.

### 3c. Execute
- **Merge**: Append the content as a new section in the target note, with a date header. When merging, confirm the merge target is in the same folder as the routing decision. If the best merge target is in a different folder, note this to the user and ask which should take precedence: the routing decision or the merge.
- **New note**: Create `[destination-folder]/[subfolder]/[Topic Name].md` with proper frontmatter
- **Archive**: If the item is outdated or irrelevant, move to `[archive_folder]/YYYY/MM/`

Always add wikilinks connecting to at least one related note.

---

## Step 4: Handle Tasks

If inbox items contain unchecked tasks (`- [ ]`):
- Leave them in place (the Tasks plugin will find them wherever they live)
- Or ask: "Do you want to move the open tasks to your project notes?"

---

## Step 5: Archive Processed Items

After an inbox item has been fully processed and its content merged/filed:
- Move the original file to `[archive_folder]/YYYY/MM/` (using today's date, don't delete it)
- Or delete it if the user prefers a clean inbox

Ask preference once: "After processing, should I archive originals or delete them?"

---

## Step 6: Summary

Report:
──────────────────────────────────────────────────────────────
📥 Inbox Processed — {N} notes
──────────────────────────────────────────────────────────────
Moved:
  `{filename}`  →  {folder}/{subfolder}

Kept in inbox ({M}):
  `{filename}` — {reason}
(omit "Kept in inbox" block if all items moved)

{P} tasks remain open across your vault.
(omit if no open tasks)
──────────────────────────────────────────────────────────────
{N} moved, {M} kept. Inbox {clear / down to M items}.

Empty state:
✅ Inbox is empty — nothing to process.
