---
name: import
description: Import local files (PDF, Word, PowerPoint, Excel, images, video, scripts) from a staging inbox folder or explicit path into structured markdown notes in 04-resources/. Invoke when user runs /import, /import [path], or /import --attach.
---

# Import

Process local files into permanent vault notes in `04-resources/`.

Usage:
- `/import` — scan default inbox (`00-inbox/imports/`)
- `/import /path/to/file` — import a single explicit file
- `/import --attach` — scan inbox and copy supported files into vault for inline Obsidian preview
- `/import /path/to/file --attach` — single file with attach

---

## Orchestrator Flow

### Step 1: Resolve source and parse flags

Parse arguments:
- Extract `--attach` flag if present (remove from path consideration)
- If a file path is provided after `/import`: this is single-file mode
- If no path: this is batch mode (scan inbox)

**Single-file mode:**
1. Validate the file exists. If not, report and stop.
2. Determine file type from extension (see Supported File Types below).
3. If unsupported type, report:
   > `[filename]` is not a supported file type. Supported: PDF, Word, Excel, PowerPoint, images, video, Python/Shell/SQL scripts.
   Then stop.
4. Note whether the file is inside the inbox folder (used in cleanup — files outside inbox are never deleted).
5. Skip Steps 2 and 3 below. Go directly to Step 4 with this single file.

**Batch mode:**
1. Read `vault.yml` for `folders.import_inbox` (default: `00-inbox/imports`).
2. List all files recursively in the inbox folder.
3. If inbox is empty, report:
   > Inbox is empty (`[inbox path]`). Add files there and run `/import` again, or run `/import /path/to/file`.
   Then stop.

### Step 2: Group and display (batch mode only)

Group files by type. Show a confirmation table:

```
Found N files to import:

  report.pdf          PDF document
  budget.xlsx         Excel spreadsheet
  hero-image.png      Image
  cleanup.sh          Shell script
  deck.pptx           PowerPoint
  unknown.xyz         ⚠ Unsupported — will be skipped

Proceed with all? Or type filenames to skip (comma-separated, or "all"):
```

Unsupported file types are listed with a warning but not processed.

### Step 3: User confirms (batch mode only)

Wait for user response:
- If "all" or blank/enter: proceed with all supported files
- If comma-separated filenames: exclude those files from processing
- Proceed with confirmed set

### Step 4: Dispatch parallel subagents

For each file in the confirmed set, dispatch one subagent in parallel. Each subagent receives:
- Absolute file path
- Detected file type
- Vault root path
- Whether `--attach` flag is set
- Whether the file is inside the inbox folder (cleanup flag)

Each subagent runs the appropriate handler section from this skill (see below).

### Step 5: Collect results and report

After all subagents complete, show a summary:

```
Import complete — 4 notes created:

  04-resources/research/report.md         (from report.pdf)
  04-resources/finance/budget-summary.md  (from budget.xlsx)
  04-resources/media/hero-image.md        (from hero-image.png)
  04-resources/scripts/cleanup.md         (from cleanup.sh)

4 files removed from inbox.
```

If any subagent failed:
```
⚠ 1 file failed:
  deck.pptx — pandoc not installed. File left in inbox. Install with: brew install pandoc
```

If a note was created but the inbox delete failed (partial success):
```
⚠ 1 partial success:
  report.pdf — note created at 04-resources/research/report.md, but inbox file could not be deleted. Delete manually.
```

### Supported File Types

| Extension | Type | Handler section |
|-----------|------|----------------|
| `.pdf` | PDF | PDF Handler |
| `.docx` | Word | Word Handler |
| `.xlsx`, `.xls` | Excel | Excel Handler |
| `.pptx`, `.ppt` | PowerPoint | PowerPoint Handler |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | Image | Image / GIF / SVG Handler |
| `.svg` | SVG | Image / GIF / SVG Handler |
| `.mp4`, `.mov`, `.webm`, `.mkv` | Video | Video Handler |
| `.py` | Python | Script Handler |
| `.sh`, `.bash`, `.zsh` | Shell | Script Handler |
| `.sql` | SQL | Script Handler |

---

## PDF Handler

[TO BE FILLED IN TASK 3]

---

## Word Handler (.docx)

[TO BE FILLED IN TASK 4]

---

## Excel Handler (.xlsx / .xls)

[TO BE FILLED IN TASK 4]

---

## PowerPoint Handler (.pptx / .ppt)

[TO BE FILLED IN TASK 4]

---

## Image / GIF / SVG Handler

[TO BE FILLED IN TASK 5]

---

## Video Handler

[TO BE FILLED IN TASK 6]

---

## Script Handler

[TO BE FILLED IN TASK 7]

---

## Note Template

[TO BE FILLED IN TASK 8]
