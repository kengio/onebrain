---
name: reorganize
description: Reorganize existing flat notes into subfolders — one-time migration for vaults that predate subfolder organization
---

# Reorganize Vault into Subfolders

Move existing flat notes in `01-projects/`, `02-knowledge/`, and `04-logs/` into category-based subfolders (kebab-case, max 2 levels). Archive notes go to `03-archive/YYYY/MM/`.

Run this once after upgrading to a version of OneBrain that uses subfolders.

---

## Before You Begin

Read `vault.yml` to get the correct folder names. Use those names throughout.

**Important:** Obsidian wikilinks (`[[Note Name]]`) resolve by filename regardless of path — moving files into subfolders does NOT break any existing links in your vault.

---

## Step 1: Scan for Flat Notes

Find notes that are directly in a top-level folder (not already in a subfolder):

- `01-projects/*.md` — glob top-level only (not `01-projects/**/*.md`)
- `02-knowledge/*.md` — glob top-level only
- `04-logs/*.md` — flat session log files not yet in a `YYYY/MM/` subfolder

Also check `03-archive/*.md` for any flat archive files.

Exclude `.gitkeep` files.

Report:
> Found N notes to organize:
> - `02-knowledge/`: N notes
> - `01-projects/`: N notes
> - `04-logs/`: N session logs
> - `03-archive/`: N archive files

If nothing is found, say:
> Your vault is already organized into subfolders — nothing to do!

---

## Step 2: Propose Subfolder Assignments

For each note, analyze its content and frontmatter to suggest a subfolder:

**For `02-knowledge/` and `01-projects/` notes:**
- Read the file's title, tags, and first paragraph
- Suggest a kebab-case subfolder path (max 2 levels, e.g. `programming/python`, `health/fitness`)
- Group notes with the same suggested subfolder together

**For `04-logs/` session log files:**
- Extract `YYYY` and `MM` from the filename (`YYYY-MM-DD-session-NN.md`)
- Suggest `YYYY/MM` as the subfolder

**For `03-archive/` flat files:**
- Use today's date for archiving: `YYYY/MM`
- Or read the note's `created:` frontmatter if present and use that date instead

Present the full migration plan as a table:

```
## Proposed Reorganization

### 02-knowledge/ (N notes)
| Note | → Subfolder |
|------|------------|
| Machine Learning.md | → technology/ai |
| Python Basics.md | → programming/python |
| Sleep Optimization.md | → health |

### 01-projects/ (N notes)
| Note | → Subfolder |
|------|------------|
| Website Redesign.md | → web-development |

### 04-logs/ (N session logs)
| File | → Subfolder |
|------|------------|
| 2026-01-15-session-01.md | → 2026/01 |
| 2026-02-03-session-01.md | → 2026/02 |
```

---

## Step 3: Let User Adjust

Say:
> Does this look right? You can:
> - **Approve all** — move everything as proposed
> - **Adjust a note** — tell me the note name and where to put it instead
> - **Skip a note** — tell me which ones to leave in place
> - **Cancel** — do nothing

Wait for response. Apply any requested adjustments before proceeding.

---

## Step 4: Execute Moves

For each approved move:

1. Create the subfolder if it doesn't exist (use `mkdir -p [target_folder]/[subfolder]`)
2. Move the file: `mv "[source_path]" "[target_path]"`
3. Confirm each move silently; report errors immediately

Process notes by folder (all knowledge, then projects, then logs, then archive).

---

## Step 5: Summary

Report:
> Reorganization complete!
>
> - Moved N notes in `02-knowledge/` into N subfolders
> - Moved N notes in `01-projects/` into N subfolders
> - Moved N session logs in `04-logs/` into YYYY/MM folders
> - Moved N files in `03-archive/` into YYYY/MM folders
> - Skipped N notes (left in place)
>
> All existing wikilinks (`[[Note Name]]`) still work — Obsidian resolves links by filename, not path.
>
> Want to run `/connect` to find new connections between your organized notes?
