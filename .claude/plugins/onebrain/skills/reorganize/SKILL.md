---
name: reorganize
description: Migrate vault structure — either full 5-folder → 8-folder migration, or subfolder organization for flat notes
---

# Reorganize Vault

This skill handles two scenarios:

- **Legacy migration** (old 5-folder → new 8-folder structure): adds `02-areas/`, `04-resources/`, `05-agent/`, renumbers archive/logs. Run this if your vault was set up before the 8-folder layout.
- **Subfolder migration** (original purpose, unchanged): moves flat notes into kebab-case subfolders within their existing folders.

---

## Before You Begin

**Check vault version:** Read `vault.yml`. If the `folders.areas` key is absent, this vault uses the old structure and needs full migration — run the Full Migration section first. If `folders.areas` is present, skip to the Subfolder Migration section.

**Important:** Obsidian wikilinks (`[[Note Name]]`) resolve by filename regardless of path — moving files does NOT break any existing links in your vault.

---

## Full Migration (5-folder → 8-folder)

Only run if `vault.yml` is missing `folders.areas`.

1. Create new folders: `02-areas/`, `04-resources/`, `05-agent/context/`, `05-agent/memory/`
2. Rename `03-archive/` → `06-archive/`: move all contents preserving `YYYY/MM/` structure
3. Rename `04-logs/` → `07-logs/`: move all contents preserving `YYYY/MM/` structure
4. Classify existing `02-knowledge/` notes:
   - If tags include `research`, `summary`, or `reference` in frontmatter → move to `04-resources/[same subfolder]`
   - If frontmatter has a `source:` field matching `/research`, `/summarize-url`, or `/reading-notes` → move to `04-resources/`
   - Otherwise → keep in `03-knowledge/` (treat as synthesized content)
   - Notes that cannot be automatically classified → list them and ask the user before moving
5. Write `README.md` into each new root folder (content from `.claude/plugins/onebrain/skills/onboarding/SKILL.md` Step 10b)
6. Update `vault.yml` with all 8 keys:
   ```yaml
   method: onebrain
   folders:
     inbox: 00-inbox
     projects: 01-projects
     areas: 02-areas
     knowledge: 03-knowledge
     resources: 04-resources
     agent: 05-agent
     archive: 06-archive
     logs: 07-logs
   ```
7. Report: files moved to `04-resources/`, files kept in `03-knowledge/`, files needing manual review

---

## Subfolder Migration

Move existing flat notes into category-based subfolders (kebab-case, max 2 levels). Run this once after upgrading to a version of OneBrain that uses subfolders.

### Step 1: Scan for Flat Notes

Find notes that are directly in a top-level folder (not already in a subfolder):

- `01-projects/*.md` — glob top-level only (not `01-projects/**/*.md`)
- `02-areas/*.md` — glob top-level only
- `03-knowledge/*.md` — glob top-level only
- `04-resources/*.md` — glob top-level only
- `07-logs/*.md` — flat session log files not yet in a `YYYY/MM/` subfolder

Also check `06-archive/*.md` for any flat archive files.

Exclude `.gitkeep` files.

Report:
> Found N notes to organize:
> - `03-knowledge/`: N notes
> - `04-resources/`: N notes
> - `02-areas/`: N notes
> - `01-projects/`: N notes
> - `07-logs/`: N session logs
> - `06-archive/`: N archive files

If nothing is found, say:
> Your vault is already organized into subfolders — nothing to do!

---

### Step 2: Propose Subfolder Assignments

For each note, analyze its content and frontmatter to suggest a subfolder:

**For `03-knowledge/`, `04-resources/`, `02-areas/`, and `01-projects/` notes:**
- Read the file's title, tags, and first paragraph
- Suggest a kebab-case subfolder path (max 2 levels, e.g. `programming/python`, `health/fitness`)
- Group notes with the same suggested subfolder together

**For `07-logs/` session log files:**
- Extract `YYYY` and `MM` from the filename (`YYYY-MM-DD-session-NN.md`)
- Suggest `YYYY/MM` as the subfolder

**For `06-archive/` flat files:**
- Use today's date for archiving: `YYYY/MM`
- Or read the note's `created:` frontmatter if present and use that date instead

Present the full migration plan as a table:

```
## Proposed Reorganization

### 03-knowledge/ (N notes)
| Note | → Subfolder |
|------|------------|
| Machine Learning.md | → technology/ai |
| Sleep Optimization.md | → health |

### 04-resources/ (N notes)
| Note | → Subfolder |
|------|------------|
| Python Basics.md | → programming/python |

### 01-projects/ (N notes)
| Note | → Subfolder |
|------|------------|
| Website Redesign.md | → web-development |

### 07-logs/ (N session logs)
| File | → Subfolder |
|------|------------|
| 2026-01-15-session-01.md | → 2026/01 |
| 2026-02-03-session-01.md | → 2026/02 |
```

---

### Step 3: Let User Adjust

Say:
> Does this look right? You can:
> - **Approve all** — move everything as proposed
> - **Adjust a note** — tell me the note name and where to put it instead
> - **Skip a note** — tell me which ones to leave in place
> - **Cancel** — do nothing

Wait for response. Apply any requested adjustments before proceeding.

---

### Step 4: Execute Moves

For each approved move:

1. Create the subfolder if it doesn't exist (use `mkdir -p [target_folder]/[subfolder]`)
2. Move the file: `mv "[source_path]" "[target_path]"`
3. Confirm each move silently; report errors immediately

Process notes by folder (all knowledge, then resources, then areas, then projects, then logs, then archive).

---

### Step 5: Summary

Report:
> Reorganization complete!
>
> - Moved N notes in `03-knowledge/` into N subfolders
> - Moved N notes in `04-resources/` into N subfolders
> - Moved N notes in `02-areas/` into N subfolders
> - Moved N notes in `01-projects/` into N subfolders
> - Moved N session logs in `07-logs/` into YYYY/MM folders
> - Moved N files in `06-archive/` into YYYY/MM folders
> - Skipped N notes (left in place)
>
> All existing wikilinks (`[[Note Name]]`) still work — Obsidian resolves links by filename, not path.
>
> Want to run `/connect` to find new connections between your organized notes?
