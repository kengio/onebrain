---
name: import
description: Import local files (PDF, Word, PowerPoint, Excel, images, video, scripts) from a staging inbox folder or explicit path into structured markdown notes in the resources folder (default 04-resources/, resolved from vault.yml). Invoke when user runs /import, /import [path], or /import --attach.
---

# Import

Process local files into permanent vault notes in `[resources]/` (resolved from vault.yml; default: `04-resources/`).

Usage:
- `/import` : scan default import staging inbox (`[inbox]/imports/`, resolved from vault.yml)
- `/import /path/to/file` : import a single explicit file
- `/import --attach` : scan inbox and copy supported files into vault for inline Obsidian preview
- `/import /path/to/file --attach` : single file with attach

---

## Orchestrator Flow

### Step 1: Resolve source and parse flags

Resolve folders from `vault.yml` (read the file if it exists at the vault root):
- If `vault.yml` does not exist: use all defaults below.
- If `vault.yml` exists but cannot be parsed: report the error and stop : do not proceed with unknown folder paths.
- `folders.inbox` → default: `00-inbox` (vault inbox; used to derive import staging path)
- `folders.import_inbox` → default: `[inbox]/imports` (import staging folder; substituting the resolved `[inbox]` value)
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
4. Note whether the file is inside the inbox folder (used in cleanup : files outside inbox are never deleted).
5. Skip Steps 2 and 3 below. Go directly to Step 4 with this single file.

**Batch mode:**
1. Use `[inbox]` resolved in Step 1 above (default: `[inbox]/imports` from vault.yml).
2. List all files recursively in the inbox folder.
3. If the inbox folder does not exist, report:
   > Import inbox not found at `[inbox path]`. Run `/onboarding` to set up your vault, or use `/import /path/to/file` to import a specific file.
   Then stop.
4. If inbox is empty, report:
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
  unknown.xyz         ⚠ Unsupported : will be skipped

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
Import complete : 4 notes created:

  [resources]/research/report.md         (from report.pdf)
  [resources]/finance/budget-summary.md  (from budget.xlsx)
  [resources]/media/hero-image.md        (from hero-image.png)
  [resources]/scripts/cleanup.md         (from cleanup.sh)

4 files removed from inbox.
```

If any subagent failed:
```
⚠ 1 file failed:
  deck.pptx : markitdown not installed. File left in inbox. Install with: pipx install markitdown
```

If any files were skipped due to unsupported type:
```
⏭ 2 files skipped (unsupported : left in inbox):
  unknown.xyz
  notes.txt
```

If a note was created but the inbox delete failed (partial success):
```
⚠ 1 partial success:
  report.pdf : note created at [resources]/research/report.md, but inbox file could not be deleted. Delete manually.
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

## Handler Safety Rules

These rules apply to **all** handlers. No exceptions.

**1. Cleanup is conditional on note creation success.**
Delete an inbox file ONLY after the Write tool confirms the note was created. If note creation fails for any reason: return an error, leave the inbox file untouched, stop.

**2. Stub notes do NOT trigger cleanup.**
When a stub note is created (extraction tool unavailable, extraction failed, empty document): do NOT delete the inbox file. The user needs it to retry after fixing the issue.

**3. Read/extraction failures stop processing.**
If the Read tool, markitdown, or any extraction step returns an error or empty output: do NOT create a note. Return an error. Do NOT delete the inbox file.

**4. File validation before processing.**
Check file size with `ls -la "[filepath]"`. If 0 bytes: create a stub note ("File is empty : no content to extract."), do NOT delete inbox file, return.

**5. `--attach` directory creation.**
Before every `cp`, run `mkdir -p` for the target directory. If `cp` fails: skip the embed, report the failure, do NOT delete inbox file, stop.

**6. Filename collision.**
Before writing a note, check if the target path already exists. If it does: append ` (Imported YYYY-MM-DD)` to the filename and note the rename in the summary.

---

## markitdown Dependency

Used by the Word, PowerPoint, and Excel handlers. Each handler references this section for detection, OS check, Python check, and install : instead of duplicating the logic.

### 1. Detection

```bash
command -v markitdown
```

Exit 0 → markitdown is installed. Proceed with the handler.
Non-zero or command not found → run OS detection below before attempting install.

### 2. OS Detection

Run `uname`:
- `Darwin` → proceed to Python check
- `Linux` AND `uname -r` contains `microsoft` or `WSL` (WSL) → treat as Linux, proceed to Python check
- `Linux` AND `uname -r` does NOT contain `microsoft` or `WSL` (native Linux) → proceed to Python check
- Windows non-WSL: `$OS` equals `Windows_NT` AND uname fails or returns `MINGW`/`CYGWIN` →
  create stub note:
  > ⚠ Windows detected (non-WSL). /import requires WSL. Run this in a WSL terminal and retry.
  Stop. Do NOT delete the inbox file.
- `uname` not found: proceed to Python check (assume POSIX-compatible environment).

### 3. Python Check

```bash
python3 --version
```

Not found → create stub note:
> ⚠ Python 3 is not installed. Install Python first:
> - macOS: `brew install python3`
> - Linux/WSL: `sudo apt install python3`
>
> Then run: `pipx install markitdown` and re-import this file.

Stop. Do NOT delete the inbox file.

### 4. Install

Try in order:
```bash
pipx install markitdown   # preferred (isolated environment)
```
If `pipx` is not found:
```bash
pip3 install markitdown   # macOS/Linux/WSL
pip install markitdown    # fallback if pip3 not in PATH
```

Install succeeded → retry the handler from the beginning (markitdown is now available).

Install failed → create stub note:
> ⚠ markitdown could not be installed automatically.
> Install manually: `pipx install markitdown`, then re-import this file.

Stop. Do NOT delete the inbox file.

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
   - Run: `mkdir -p "[vault-root]/[attachments]/pdf/"`
   - Run: `cp "[filepath]" "[vault-root]/[attachments]/pdf/[filename]"`
   - If `cp` fails: skip embed, report failure, do NOT delete inbox file, stop
   - Add `![[filename]]` embed to the note body (above the Summary section)

6. Cleanup : only if step 4 (note creation) succeeded:
   - If the file was inside the inbox folder: `rm "[filepath]"`
   - If the file was an explicit path outside the inbox: do NOT delete it
   - If delete fails: report as partial success (note created, manual delete needed)

7. Return: note path, or error with reason

---

## Word Handler (.docx)

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

> Requires `markitdown` (install: `pipx install markitdown`). Falls back to stub note if unavailable.

1. Check markitdown is available : follow the **markitdown Dependency** section above. If the dependency flow could not install markitdown, skip to step 5 (stub note).

2. Extract markdown:
   ```bash
   markitdown "[filepath]"
   ```
   - If exit non-zero OR output is empty/whitespace: skip to step 5 (stub note, reason: "markitdown failed or document is empty").
   - Otherwise capture the output as markdown text.

3. From the extracted markdown, identify:
   - **Title**: first `#` heading, or derive from filename
   - **Headings and key sections**: structure is already preserved in the markdown output
   - **Core content**: main points, arguments, or information

4. Choose output subfolder (same rule as PDF Handler : including single-file confirmation). Create note using Note Template:
   - `file_type`: `docx`
   - Summary: 2-3 sentence distillation
   - Key Points: bullet list of main points

5. **Stub note fallback** (if markitdown unavailable or failed):
   Create a minimal note with the appropriate message:
   - Not installed / install failed: "⚠ Content could not be extracted : `markitdown` is not installed or could not be installed automatically. Install with: `pipx install markitdown`, then re-import this file."
   - Failed / empty: "⚠ Content could not be extracted : markitdown returned an error or the document is empty. File left in inbox for retry."
   - Key Points: "_Open the file to review its contents and fill in this section._"
   **Do NOT delete the inbox file when a stub note is created.**

6. `--attach` is NOT supported for Word files (no Obsidian preview value).

7. Cleanup : only if a full note was created (markitdown succeeded in step 2). If a stub note was created, do NOT delete the inbox file.

8. Return: note path, or error with reason.

---

## Excel Handler (.xlsx / .xls)

Executed by a subagent. Inputs: file path, vault root, inbox flag. (--attach flag not supported for this type)

> Requires `markitdown` (install: `pipx install markitdown`). Falls back to stub note if unavailable.

1. Check markitdown is available : follow the **markitdown Dependency** section above. If the dependency flow could not install markitdown, skip to step 5 (stub note).

2. Extract tables:
   ```bash
   markitdown "[filepath]"
   ```
   - If exit non-zero OR output is empty/whitespace: skip to step 5 (stub note, reason: "markitdown failed or spreadsheet is empty").
   - Otherwise capture the markdown output. markitdown converts each sheet to a markdown table.

3. Generate AI summary:
   From the extracted markdown, write 2-3 sentences describing:
   - What kind of data this spreadsheet contains
   - How many sheets (if multiple)
   - Notable values, patterns, or structure

4. Choose output subfolder (same rule as PDF Handler : including single-file confirmation). Create note using Note Template:
   - `file_type`: `xlsx` (use for both .xlsx and .xls files)
   - Build the note body as follows (replace the standard Summary / Key Points structure):

   ```
   ## Summary

   [AI-generated description from step 3]

   ## [Sheet Name]

   [markdown table from markitdown output for this sheet]

   ## [Sheet 2 Name]   ← repeat for each additional sheet
   ```

5. **Stub note fallback** (if markitdown unavailable or failed):
   Create a minimal note with the appropriate message:
   - Not installed / install failed: "⚠ Content could not be extracted : `markitdown` is not installed or could not be installed automatically. Install with: `pipx install markitdown`, then re-import this file."
   - Failed / empty:
     - If `.xls` file: "⚠ Content could not be extracted : legacy .xls format may not be fully supported. Convert to .xlsx and re-import, or open the file manually."
     - Otherwise: "⚠ Content could not be extracted : markitdown returned an error or the spreadsheet is empty. File left in inbox for retry."
   - `## Summary` section left blank for manual entry.
   **Do NOT delete the inbox file when a stub note is created.**

6. `--attach` is NOT supported for Excel files.

7. Cleanup : only if a full note was created (markitdown succeeded in step 2). If a stub note was created, do NOT delete the inbox file. If delete fails, report as partial success.

8. Return: note path, or error with reason.

---

## PowerPoint Handler (.pptx / .ppt)

Executed by a subagent. Inputs: file path, vault root, inbox flag. (--attach flag not supported for this type)

> Requires `markitdown` (install: `pipx install markitdown`). Falls back to stub note if unavailable.

1. Check markitdown is available : follow the **markitdown Dependency** section above. If the dependency flow could not install markitdown, skip to step 5 (stub note).

2. Extract markdown:
   ```bash
   markitdown "[filepath]"
   ```
   - If exit non-zero OR output is empty/whitespace: skip to step 5 (stub note, reason: "markitdown failed or presentation is empty").
   - Otherwise capture the output as markdown text.

3. From the extracted markdown, create a slide outline:
   - markitdown maps slide titles to `##` headings : use these as the slide structure
   - The `## Slide Outline` section is populated from these headings and their content

4. Choose output subfolder (same rule as PDF Handler : including single-file confirmation). Create note using Note Template:
   - `file_type`: `pptx`
   - Summary: 2-3 sentences describing the presentation's purpose and audience
   - Key section: `## Slide Outline` (slide titles as headings + key points per slide)

5. **Stub note fallback** (if markitdown unavailable or failed):
   - Not installed / install failed: "⚠ Content could not be extracted : `markitdown` is not installed or could not be installed automatically. Install with: `pipx install markitdown`, then re-import this file."
   - Failed / empty: "⚠ Content could not be extracted : markitdown returned an error or the presentation is empty. File left in inbox for retry."
   **Do NOT delete the inbox file when a stub note is created.**

6. `--attach` is NOT supported for PowerPoint files.

7. Cleanup : only if a full note was created (markitdown succeeded in step 2). If a stub note was created, do NOT delete the inbox file.

8. Return: note path, or error with reason.

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

**For SVG (vector graphics : treated as structured XML, not visual):**

1. Read the SVG file as text using the Read tool.

2. Describe:
   - What the SVG represents (icon, diagram, illustration, chart)
   - Key structural elements (paths, shapes, text, groups)
   - Likely use case

3. Create note same as above (same subfolder selection rule : confirm in single-file mode, auto-select in batch mode), but with `file_type`: `svg`.

**--attach behavior (PNG, JPG, JPEG, GIF, WebP, SVG):**
- Run: `mkdir -p "[vault-root]/[attachments]/images/"`
- Run: `cp "[filepath]" "[vault-root]/[attachments]/images/[filename]"`
- If `cp` fails: skip embed, report failure, do NOT delete inbox file, stop
- Add `![[filename]]` embed above the Summary section in the note

**Cleanup** : only after note creation succeeded AND (if `--attach` was set) `cp` succeeded. If `cp` failed, the handler already stopped; do not reach this step. If the file was inside the inbox folder: `rm "[filepath]"`. If delete fails, report as partial success.

**Return:** Note path, or error with reason.

---

## Video Handler

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

1. Collect metadata:
   - Filename (without extension) → use as note title
   - File size: `ls -lh "[filepath]"` via Bash : if the command fails, record size as "unknown"
   - File extension (format type: MP4, MOV, WebM, MKV)

2. Choose output subfolder (suggest `media` or `video`; confirm with user in single-file mode, auto-select in batch mode). Create note using Note Template:
   - `file_type`: `video`
   - Summary: "Video file: [filename]. Format: [extension]. Size: [size]."
   - Key Points: left blank : add context about this video manually

3. `--attach` behavior:
   - Run: `mkdir -p "[vault-root]/[attachments]/video/"`
   - Run: `cp "[filepath]" "[vault-root]/[attachments]/video/[filename]"`
   - If `cp` fails: skip embed, report failure, do NOT delete inbox file, stop
   - Add `![[filename]]` embed above the Summary section

4. Cleanup : only after note creation succeeded AND (if `--attach` was set) `cp` succeeded. If `cp` failed, the handler already stopped; do not reach this step. If the file was inside the inbox folder: `rm "[filepath]"`. If delete fails, report as partial success.

5. Return: note path.

---

## Script Handler

Executed by a subagent. Inputs: file path, vault root, inbox flag.

Handles: `.py`, `.sh`, `.bash`, `.zsh`, `.sql`

1. Read the file content verbatim using the Read tool.
   - If Read returns an error or empty output: return an error ("Could not read [filename] : file may be empty or unreadable. File left in inbox."). Do NOT create a note. Do NOT delete inbox file. Stop.

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

5. Cleanup : only if step 1 (Read) succeeded and the note was created. If the file was inside the inbox folder: `rm "[filepath]"`. If delete fails, report as partial success.

6. Return: note path.

---

## Note Template

All handlers use this base template. Type-specific sections are added by each handler.

The note structure:

**If file came from an explicit path (not inbox) : file is kept in place:**

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

[Extracted structure : key sections, data highlights, slide outline, script analysis, etc.]

## Related

[[linked vault notes]]
```

**If file came from the inbox : file is deleted after import:**

```markdown
---
tags: [import, <type-tag>]
created: YYYY-MM-DD
source: /import
file_type: <pdf|docx|xlsx|pptx|image|svg|video|script>
---

# [Filename or derived title]

> **Imported from inbox:** YYYY-MM-DD : staging copy removed after import

[If --attach flag was used and file type supports it, add: ![[filename]] ]

## Summary

[2-3 sentence distillation, AI description, or plain-language explanation]

## Key Points / Contents

[Extracted structure : key sections, data highlights, slide outline, script analysis, etc.]

## Related

[[linked vault notes]]
```

**Type-specific section additions (after Key Points):**
- **Scripts**: `## Code` : full file content in a fenced code block
- **PowerPoint**: `## Slide Outline` : slide titles as headings + key points per slide
- **Excel (full extraction)**: replaces `## Key Points / Contents` : use `## Summary` (AI-generated) + `## [Sheet Name]` (markdown table per sheet)
- **Excel (stub)**: `## Summary` : left blank for manual entry

**Scan for related notes:** After creating the note, grep `[resources]/**/*.md` and `03-knowledge/**/*.md` for titles or tags related to the file's topic. Suggest up to 2 wikilinks if found. If no related notes are found, leave the `## Related` section with: `_No related notes found : add links manually._`

> **Note on `file_path`:** `file_path` is only included for files imported from an explicit path (kept in place after import). For inbox-staged files, `file_path` is omitted : the staging copy is deleted and the note is the permanent artifact.
