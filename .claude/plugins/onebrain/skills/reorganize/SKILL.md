---
name: reorganize
description: "Migrate vault structure : either full 5-folder → 8-folder migration, or subfolder organization for flat notes"
---

# Reorganize Vault

This skill handles two scenarios:

- **Legacy migration** (old 5-folder → new 8-folder structure): adds `02-areas/`, `04-resources/`, `05-agent/`, renumbers archive/logs. Run this if your vault was set up before the 8-folder layout.
- **Subfolder migration** (original purpose, unchanged): moves flat notes into kebab-case subfolders within their existing folders.

---

## Before You Begin

**Check vault version:** Read `vault.yml`. If the `folders.areas` key is absent, this vault uses the old structure and needs full migration : run the Full Migration section first. If `folders.areas` is present, skip to the Subfolder Migration section.

**Important:** Obsidian wikilinks (`[[Note Name]]`) resolve by filename regardless of path : moving files does NOT break any existing links in your vault.

---

## Full Migration (5-folder → 8-folder)

Only run if `vault.yml` is missing `folders.areas`.

1. Create new folders: `02-areas/`, `04-resources/`, `05-agent/memory/`
2. Rename `03-archive/` → `06-archive/`: move all contents preserving `YYYY/MM/` structure
3. Rename `04-logs/` → `07-logs/`: move all contents preserving `YYYY/MM/` structure
4. Classify existing `02-knowledge/` notes:
   - If tags include `research`, `summary`, or `reference` in frontmatter → move to `04-resources/[same subfolder]`
   - If frontmatter has a `source:` field matching `/research`, `/summarize`, or `/reading-notes` → move to `04-resources/[same subfolder]`
   - Otherwise → keep in `03-knowledge/` (treat as synthesized content)
   - Notes that cannot be automatically classified → list them and ask the user before moving
5. Verify `05-agent/INDEX.md` exists; if not, create an empty INDEX.md with the standard frontmatter (`total_active: 0`, `total_needs_review: 0`, `updated: YYYY-MM-DD`)
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

- `[projects_folder]/*.md` : glob top-level only (not `[projects_folder]/**/*.md`)
- `[areas_folder]/*.md` : glob top-level only
- `[knowledge_folder]/*.md` : glob top-level only
- `[resources_folder]/*.md` : glob top-level only
- `[logs_folder]/*.md` : flat session log files not yet in a `YYYY/MM/` subfolder

Also check `[archive_folder]/*.md` for any flat archive files.

Exclude `.gitkeep` files.

Report:
──────────────────────────────────────────────────────────────
📁 Proposed Reorganization
──────────────────────────────────────────────────────────────
🗂️  [knowledge_folder]/ ({N} notes)
🗂️  [resources_folder]/ ({N} notes)
🗂️  [areas_folder]/ ({N} notes)
🗂️  [projects_folder]/ ({N} notes)
🗂️  [logs_folder]/ ({N} session logs)
🗂️  [archive_folder]/ ({N} archive files)

If nothing is found:
✅ Nothing to do — vault already organized into subfolders.

---

### Step 2: Propose Subfolder Assignments

For each note, analyze its content and frontmatter to suggest a subfolder:

**For `[knowledge_folder]/`, `[resources_folder]/`, `[areas_folder]/`, and `[projects_folder]/` notes:**
- Read the file's title, tags, and first paragraph
- Suggest a kebab-case subfolder path (max 2 levels, e.g. `programming/python`, `health/fitness`)
- Group notes with the same suggested subfolder together

**For `[logs_folder]/` session log files:**
- Extract `YYYY` and `MM` from the filename (`YYYY-MM-DD-session-NN.md`)
- Suggest `YYYY/MM` as the subfolder

**For `[archive_folder]/` flat files:**
- Use today's date for archiving: `YYYY/MM`
- Or read the note's `created:` frontmatter if present and use that date instead

Present the full migration plan as a table:

```
## Proposed Reorganization

### [knowledge_folder]/ (N notes)
| Note | → Subfolder |
|------|------------|
| Machine Learning.md | → technology/ai |
| Sleep Optimization.md | → health |

### [resources_folder]/ (N notes)
| Note | → Subfolder |
|------|------------|
| Python Basics.md | → programming/python |

### [projects_folder]/ (N notes)
| Note | → Subfolder |
|------|------------|
| Website Redesign.md | → web-development |

### [logs_folder]/ (N session logs)
| File | → Subfolder |
|------|------------|
| 2026-01-15-session-01.md | → 2026/01 |
| 2026-02-03-session-01.md | → 2026/02 |

──────────────────────────────────────────────────────────────
{N} notes total · Proceed?
```

---

### Step 3: Let User Adjust

Say:
> Does this look right? You can:
> - **Approve all** : move everything as proposed
> - **Adjust a note** : tell me the note name and where to put it instead
> - **Skip a note** : tell me which ones to leave in place
> - **Cancel** : do nothing

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
✅ Moved {N} notes into subfolders.

- Moved N notes in `[knowledge_folder]/` into N subfolders
- Moved N notes in `[resources_folder]/` into N subfolders
- Moved N notes in `[areas_folder]/` into N subfolders
- Moved N notes in `[projects_folder]/` into N subfolders
- Moved N session logs in `[logs_folder]/` into YYYY/MM folders
- Moved N files in `[archive_folder]/` into YYYY/MM folders
- Skipped N notes (left in place)

All existing wikilinks (`[[Note Name]]`) still work : Obsidian resolves links by filename, not path.

Want to run `/connect` to find new connections between your organized notes?
