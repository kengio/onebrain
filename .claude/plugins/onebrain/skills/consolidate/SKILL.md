---
name: consolidate
description: "Review inbox and recent notes, synthesize and merge into the knowledge base. Use when the user wants to process, organize, or clear the inbox regardless of topic — 'clean up my inbox', 'process my notes'. Do NOT use for: capturing new information now (use capture or braindump), synthesizing already-vaulted notes on a specific topic (use distill — consolidate works on the inbox), or finding note connections (use connect)."
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

AskUserQuestion:
- question: "Which items do you want to process?"
- header: "Consolidate Scope"
- multiSelect: false
- options:
  - label: "all", description: "Process all inbox items"
  - label: "last N days", description: "Process items from the last N days (specify N)"
  - label: "specific file", description: "Process a specific file (name it)"
  - label: "just review", description: "Review without moving anything"

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

**Why front-load confirmations:** The first 3 items calibrate the model's understanding of the user's routing preferences. After that pattern is established, autonomous routing reduces friction. Front-loading prevents the worst mistakes (wrong folder for the first batch) without slowing down the whole session.

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

```
onebrain qmd-reindex
```

---

## Step 7: Write Log Entry

Follow `../_shared/audit-log-format.md` (canonical frontmatter, append-per-day algorithm, run-section heading, failure mode) with:

- **Filename:** `YYYY-MM-DD-consolidate.md` — one file per day.
- **Tags:** `[audit-log, consolidate]`
- **Skill:** `/consolidate`
- **Empty inbox:** if Step 1 found nothing to process, skip writing — there is nothing to log.

Per-skill body template (canonical `## Run HH:MM` heading; metadata in first bullet):

```markdown
## Run HH:MM

- Inbox files processed: N

### Moved
- `[inbox_folder]/2026-05-10-ai-thoughts.md` → `[knowledge_folder]/ai/AI Architecture Thoughts.md` (new)
- `[inbox_folder]/2026-05-09-meeting-notes.md` → appended to `[projects_folder]/example/Project Name.md`

### Wikilinks added
- `03-knowledge/ai/AI Architecture Thoughts.md` ↔ `[[Agent Frameworks]]`, `[[OneBrain CLI]]`

### Skipped
- `00-inbox/2026-05-08-temp.md` — too short, asked user → kept in inbox
```

---

## Progress reporting

This skill is long-running. Emit a 1-line status update after each major step so the user can see progress in real time.

**In-session format:**

```
→ [step N/M] <action being taken>
```

**Examples:**

```
→ [step 1/5] reading inbox · 8 notes found...
→ [step 2/5] dispatching inbox-classifier in parallel...
→ [step 3/5] classifier returned recommendations...
→ [step 4/5] applying user decisions per note...
→ [step 5/5] moving notes + updating MEMORY-INDEX...
```

**Rules:**
- Emit one line per major step (NOT per sub-step or tool call)
- M = total steps known up front (count them before starting)
- Status lines use `→ [step N/M]` prefix exactly so they're visually distinct from skill output
- Do NOT emit heartbeats for fast operations (< 5 seconds)

---

## Known Gotchas

- **Mixed-content notes.** Braindumps often start with a personal insight but contain project tasks, external references, and reflections all in one file. Read the FULL note before classifying — the first paragraph can be misleading about the overall content type.

- **Tasks survive moves but can be duplicated by merges.** When merging an inbox note into a destination, verify the write operation preserves unchecked `- [ ]` lines from the source note rather than dropping them. The Tasks plugin finds them wherever they live, but only if they aren't silently lost during the merge.
