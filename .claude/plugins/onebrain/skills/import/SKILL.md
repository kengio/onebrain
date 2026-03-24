---
name: import
description: Import local files (PDF, Word, PowerPoint, Excel, images, video, scripts) from a staging inbox folder or explicit path into structured markdown notes in the resources folder (default 04-resources/, resolved from vault.yml). Invoke when user runs /import, /import [path], or /import --attach.
---

# Import

Process local files into permanent vault notes in `[resources]/` (resolved from vault.yml; default: `04-resources/`).

Usage:
- `/import` — scan default inbox (`00-inbox/imports/`)
- `/import /path/to/file` — import a single explicit file
- `/import --attach` — scan inbox and copy supported files into vault for inline Obsidian preview
- `/import /path/to/file --attach` — single file with attach

---

## Orchestrator Flow

### Step 1: Resolve source and parse flags

Resolve folders from `vault.yml` (read the file if it exists at the vault root):
- `folders.import_inbox` → default: `00-inbox/imports` (import staging folder)
- `folders.resources` → default: `04-resources` (output folder for notes)
- `folders.attachments` → default: `attachments` (for --attach copies)

Use these resolved values throughout. Store as `[inbox]`, `[resources]`, `[attachments]`.

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
(Inbox files will be removed after successful import)
```

Unsupported file types are listed with a warning but not processed.

### Step 3: User confirms (batch mode only)

Wait for user response:
- If "all" or blank/enter: proceed with all supported files
- If comma-separated filenames: exclude those files from processing
- Proceed with confirmed set

### Step 4: Dispatch parallel subagents

> Note: In batch mode, subagents auto-select subfolders without user confirmation. Users can move notes to different subfolders after import.

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

  [resources]/research/report.md         (from report.pdf)
  [resources]/finance/budget-summary.md  (from budget.xlsx)
  [resources]/media/hero-image.md        (from hero-image.png)
  [resources]/scripts/cleanup.md         (from cleanup.sh)

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
  report.pdf — note created at [resources]/research/report.md, but inbox file could not be deleted. Delete manually.
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

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

1. Read the PDF file using the Read tool. Claude can read PDFs natively up to 20 pages per request. For large PDFs, read in page ranges.

2. Extract:
   - **Title**: from the document title or first heading, or derive from filename
   - **Author**: if present in metadata or document
   - **Key sections**: major headings and their main points
   - **Core thesis or purpose**: what is this document fundamentally about?

3. Choose output subfolder:
   - Glob existing subfolders in `[resources]/*/` (resolved from vault.yml)
   - Pick a kebab-case subfolder matching the document's topic (e.g. `research`, `finance`, `legal`)
   - Prefer an existing subfolder if the topic matches; create a new one only if none fit
   - **Single-file mode**: confirm with user: "I'd file this under `[resources]/[suggested]/`. OK?"
   - **Batch mode**: auto-select without confirmation (user confirms all files in Step 3 of orchestrator)
   - File name: title-cased derivation of the document title (or filename if no title)

4. Create note at `[resources]/[subfolder]/[Title].md` using the Note Template below.
   - `file_type`: `pdf`
   - Summary: 2-3 sentence distillation of the document's purpose and key findings
   - Key Points: bullet list of 3-7 main points from the document

5. If `--attach` flag is set:
   - Read `vault.yml` for `folders.attachments` (default: `attachments`)
   - Copy the PDF into `[attachments]/[filename]`
   - Add `![[filename]]` embed to the note body (above the Summary section)

6. Cleanup:
   - If the file was inside the inbox folder: delete it with the Bash tool (`rm "[filepath]"`)
   - If the file was an explicit path outside the inbox: do NOT delete it
   - If delete fails: report as partial success (note created, manual delete needed)

7. Return: note path, or error with reason

---

## Word Handler (.docx)

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

> Requires `pandoc` (`brew install pandoc` on macOS). Falls back to stub note if unavailable.

1. Check if pandoc is available:
   ```bash
   which pandoc
   ```
   If not found: skip to step 5 (stub note).

2. Extract text:
   ```bash
   pandoc "[filepath]" -t plain
   ```
   Capture the output as plain text.

3. From the extracted text, identify:
   - **Title**: first heading or document title, or derive from filename
   - **Headings and key sections**: structure of the document
   - **Core content**: main points, arguments, or information

4. Choose output subfolder (same rule as PDF Handler — including single-file confirmation). Create note using Note Template:
   - `file_type`: `docx`
   - Summary: 2-3 sentence distillation
   - Key Points: bullet list of main points

5. **Stub note fallback** (if pandoc unavailable):
   Create a minimal note with:
   - Summary: "⚠ Content could not be extracted — `pandoc` is not installed. Install with: `brew install pandoc`, then re-import this file."
   - Key Points: "_Open the file to review its contents and fill in this section._"

6. `--attach` is NOT supported for Word files (no Obsidian preview value).

7. Cleanup: same as PDF Handler (delete from inbox if staged there).

8. Return: note path, or error with reason.

---

## Excel Handler (.xlsx / .xls)

Executed by a subagent. Inputs: file path, vault root, inbox flag. (--attach flag not supported for this type)

> Excel binary formats cannot be reliably extracted without specialized tools. This handler creates a stub note with a link to the original file.

1. Record: filename, file size (via `ls -lh "[filepath]"` bash command), file extension.

2. Choose output subfolder (same rule as PDF Handler — including single-file confirmation). Create note using Note Template:
   - `file_type`: `xlsx`
   - Include the `> **Original file:** [Open](file:///[filepath])` link in the note body
   - Summary: "⚠ Excel content was not extracted automatically. Open the file to review its contents and fill in this section."
   - Key Points / Contents section header: `## Data Overview` (left blank for user to fill)

3. `--attach` is NOT supported for Excel files.

4. Cleanup: same rule (delete from inbox if staged there).

5. Return: note path.

---

## PowerPoint Handler (.pptx / .ppt)

Executed by a subagent. Inputs: file path, vault root, inbox flag. (--attach flag not supported for this type)

> Requires `pandoc` (`brew install pandoc` on macOS). Falls back to stub note if unavailable.

1. Check if pandoc is available:
   ```bash
   which pandoc
   ```
   If not found: skip to step 4 (stub note).

2. Extract text:
   ```bash
   pandoc "[filepath]" -t plain
   ```

3. From the extracted text, create a slide outline:
   - Identify slide titles and main text per slide
   - Note section: `## Slide Outline` with numbered slides

   Choose output subfolder (same rule as PDF Handler — including single-file confirmation). Create note using Note Template:
   - `file_type`: `pptx`
   - Summary: 2-3 sentences describing the presentation's purpose and audience
   - Key section: `## Slide Outline` (numbered list of slide titles + key points)

4. **Stub note fallback** (if pandoc unavailable):
   Summary: "⚠ Content could not be extracted — `pandoc` is not installed. Install with: `brew install pandoc`, then re-import this file."

5. `--attach` is NOT supported for PowerPoint files.

6. Cleanup: same rule.

7. Return: note path, or error with reason.

---

## Image / GIF / SVG Handler

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

**For PNG, JPG, JPEG, GIF, WebP (visual images):**

1. Read the image using the Read tool. Claude is multimodal and can describe images visually.

2. Generate a description covering:
   - What the image shows (subject, composition, colors, style)
   - Notable elements or text visible in the image
   - Likely purpose or context (e.g., diagram, screenshot, photo, illustration)

3. Choose output subfolder (suggest `media`, `images`, or topic-based; confirm with user in single-file mode, auto-select in batch mode). Create note using Note Template:
   - `file_type`: `image`
   - Summary: the visual description from step 2
   - Key Points: notable elements, any visible text, inferred purpose

**For SVG (vector graphics — treated as structured XML, not visual):**

1. Read the SVG file as text using the Read tool.

2. Describe:
   - What the SVG represents (icon, diagram, illustration, chart)
   - Key structural elements (paths, shapes, text, groups)
   - Likely use case

3. Create note same as above (same subfolder selection rule — confirm in single-file mode, auto-select in batch mode), but with `file_type`: `svg`.

**--attach behavior (PNG, JPG, JPEG, GIF, WebP, SVG):**
- Read `vault.yml` for `folders.attachments` (default: `attachments`)
- Copy the file into `[attachments]/[filename]` using Bash:
  ```bash
  cp "[filepath]" "[vault-root]/[attachments]/[filename]"
  ```
- Add `![[filename]]` embed above the Summary section in the note

**Cleanup:** Same rule (delete from inbox if staged there).

**Return:** Note path, or error with reason.

---

## Video Handler

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

1. Collect metadata:
   - Filename (without extension) → use as note title
   - File size: `ls -lh "[filepath]"` via Bash
   - File extension (format type: MP4, MOV, WebM, MKV)

2. Choose output subfolder (suggest `media` or `video`; confirm with user in single-file mode, auto-select in batch mode). Create note using Note Template:
   - `file_type`: `video`
   - Summary: "Video file: [filename]. Format: [extension]. Size: [size]."
   - Key Points: left blank — add context about this video manually

3. `--attach` behavior:
   - Copy the file into `[attachments]/[filename]` using Bash:
     ```bash
     cp "[filepath]" "[vault-root]/[attachments]/[filename]"
     ```
   - Add `![[filename]]` embed above the Summary section

4. Cleanup: same rule.

5. Return: note path.

---

## Script Handler

Executed by a subagent. Inputs: file path, vault root, inbox flag.

Handles: `.py`, `.sh`, `.bash`, `.zsh`, `.sql`

1. Read the file content verbatim using the Read tool.

2. Analyze the script:
   - **Purpose**: what does this script do? (1-2 sentences)
   - **Inputs**: what does it take as arguments or reads from? (files, env vars, stdin)
   - **Outputs**: what does it produce? (files, stdout, database changes)
   - **Key logic**: notable algorithms, external dependencies, or non-obvious behavior

3. Choose output subfolder (suggest `scripts`, or topic-based like `data-processing`; confirm with user in single-file mode, auto-select in batch mode). Create note using Note Template:
   - `file_type`: `script`
   - Summary: the purpose description from step 2
   - Key Points: inputs, outputs, key logic
   - Add a `## Code` section after Key Points with the full file content in a fenced code block using the correct language tag:
     - `.py` → python
     - `.sh`, `.bash`, `.zsh` → bash
     - `.sql` → sql

4. `--attach` is NOT supported for scripts (content is already in the note as a code block).

5. Cleanup: same rule (delete from inbox if staged there).

6. Return: note path.

---

## Note Template

All handlers use this base template. Type-specific sections are added by each handler.

The note structure:

```markdown
---
tags: [import, <type-tag>]
created: YYYY-MM-DD
source: /import
file_type: <pdf|docx|xlsx|pptx|image|svg|video|script>
file_path: /absolute/path/to/original
---

# [Filename or derived title]

> **Original file:** [Open](file:///absolute/path/to/original)
> **Imported:** YYYY-MM-DD

[If --attach flag was used and file type supports it, add: ![[filename]] ]

## Summary

[2-3 sentence distillation, AI description, or plain-language explanation]

## Key Points / Contents

[Extracted structure — key sections, data highlights, slide outline, script analysis, etc.]

## Related

[[linked vault notes]]
```

**Type-specific section additions (after Key Points):**
- **Scripts**: `## Code` — full file content in a fenced code block
- **PowerPoint**: `## Slide Outline` — numbered slide titles and key points
- **Excel**: `## Data Overview` — left blank for user to fill in

**Scan for related notes:** After creating the note, grep `[resources]/**/*.md` and `03-knowledge/**/*.md` for titles or tags related to the file's topic. Suggest up to 2 wikilinks if found.

> **Note on `file_path`:** For inbox-staged files, this records the staging path — which is deleted after import. The note is the permanent artifact. If you need to record the original source location, add it to the frontmatter manually.
