---
name: import
description: "Import local files (PDF, Word, PowerPoint, Excel, images, video, scripts) from a staging inbox folder or explicit path into structured markdown notes in the resources folder. Invoke when user mentions a local file path to bring into the vault, or runs /import or /import --attach. Do NOT use for: fetching content from a URL (use summarize), capturing a text idea (use capture), or processing a book already read (use reading-notes)."
---

# Import

Process local files into permanent vault notes in `[resources_folder]/` (resolved from vault.yml; default: `04-resources/`).

Usage:
- `/import` : scan default import staging inbox (`[inbox_folder]/imports/`, resolved from vault.yml)
- `/import /path/to/file` : import a single explicit file
- `/import --attach` : scan inbox and copy supported files into vault for inline Obsidian preview
- `/import /path/to/file --attach` : single file with attach

---

## Orchestrator Flow

### Step 1: Resolve source and parse flags

Resolve additional folders from `vault.yml` (read the file if it exists at the vault root):
- If `vault.yml` does not exist: use all defaults below.
- If `vault.yml` exists but cannot be parsed: report the error and stop : do not proceed with unknown folder paths.
- `folders.import_inbox` → default: `[inbox_folder]/imports` (import staging folder; substituting the resolved `[inbox_folder]` placeholder)
- `folders.attachments` → default: `attachments` (for --attach copies)

Use `[inbox_folder]` and `[resources_folder]` from session config. Store resolved `[attachments_folder]` from vault.yml above.

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
1. Use `[inbox_folder]` resolved in Step 1 above (default: `[inbox_folder]/imports` from vault.yml).
2. List all files recursively in the inbox folder.
3. If the inbox folder does not exist, report:
   > Import inbox not found at `[inbox path]`. Run `/onboarding` to set up your vault, or use `/import /path/to/file` to import a specific file.
   Then stop.
4. If inbox is empty, report:
   🔴 Inbox is empty (`[inbox path]`). Add files or use `/import /path/to/file`.
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
──────────────────────────────────────────────────────────────
📂 Import Complete — {N} notes
──────────────────────────────────────────────────────────────
  `[resources_folder]/research/report.md`         (from report.pdf)
  `[resources_folder]/finance/budget-summary.md`  (from budget.xlsx)
  `[resources_folder]/media/hero-image.md`        (from hero-image.png)
  `[resources_folder]/scripts/cleanup.md`         (from cleanup.sh)

{N} files removed from inbox.
```

If any subagent failed:
```
⚠️ {N} file(s) failed:
  `{filename}` — {reason}
```

If any files were skipped due to unsupported type:
```
⏭ {N} file(s) skipped (unsupported — left in inbox):
  `{filename}`
```

If a note was created but the inbox delete failed (partial success):
```
⚠️ {N} partial success:
  `{filename}` — note created at `{vault path}`, but inbox file could not be deleted. Delete manually.
```

### Step 6: Offer Integration (optional)

Skip this step if 0 notes were successfully created.

Ask using AskUserQuestion:
- question: "Do you want to integrate any of these notes into your vault?"
- header: "Integrate"
- multiSelect: false
- options:
  - label: "yes", description: "Find related vault notes and add connections"
  - label: "skip", description: "Leave notes in resources/ as-is"

**If "skip":** done.

**If "yes":** For each successfully created note (process one at a time):

1. **Find related vault notes:** Search using qmd if available, otherwise Grep `[knowledge_folder]/**/*.md`, `[resources_folder]/**/*.md`, `[projects_folder]/**/*.md` for keywords from the imported note's title, tags, and Summary section. Exclude the imported note itself.

2. **Present suggestions:**
   ```
   ──────────────────────────────────────────────────────────────
   🔗 Integrate — `{imported-note-filename}`
   ──────────────────────────────────────────────────────────────
   Related notes found:
     1. [[Note A]] — {reason: overlapping topic or shared entity}
     2. [[Note B]] — {reason}
     3. No related notes found — adding to Related section only
   ```

3. **For each suggested related note**, ask what to do using AskUserQuestion:
   - options: `link-only` / `append-excerpt` / `skip`
   - **link-only**: add `[[imported-note-title]]` to the related note's `## Related` section (bidirectional — also add the related note to the imported note's `## Related`). If the related note has no `## Related` section, append one at the end of the file before adding the wikilink.
   - **append-excerpt**: ask the user which section of the imported note to excerpt, then append under `## From [[imported-note-title]] (YYYY-MM-DD)` in the related note
   - **skip**: no changes

4. After processing all suggestions for this note: confirm what was linked or appended.

```
onebrain qmd-reindex
```

### Supported File Types

| Extension | Type | Reference file |
|-----------|------|----------------|
| `.pdf` | PDF | `references/pdf-handler.md` |
| `.docx` | Word | `references/word-handler.md` |
| `.xlsx`, `.xls` | Excel | `references/excel-handler.md` |
| `.pptx`, `.ppt` | PowerPoint | `references/pptx-handler.md` |
| `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` | Image | `references/image-handler.md` |
| `.svg` | SVG | `references/image-handler.md` |
| `.mp4`, `.mov`, `.webm`, `.mkv` | Video | `references/video-handler.md` |
| `.py` | Python | `references/script-handler.md` |
| `.sh`, `.bash`, `.zsh` | Shell | `references/script-handler.md` |
| `.sql` | SQL | `references/script-handler.md` |

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

## Handlers

Each subagent reads the relevant handler reference file before processing. Handler Safety Rules (above) apply to all handlers without exception.

- **markitdown setup** (Word/Excel/PowerPoint): read `references/markitdown-setup.md`
- **Note template** (all file types): read `references/note-template.md`

| File type | Read before processing |
|-----------|----------------------|
| PDF | `references/pdf-handler.md` |
| Word (.docx) | `references/word-handler.md` |
| Excel (.xlsx/.xls) | `references/excel-handler.md` |
| PowerPoint (.pptx/.ppt) | `references/pptx-handler.md` |
| Image/GIF/SVG | `references/image-handler.md` |
| Video | `references/video-handler.md` |
| Script (.py/.sh/.sql) | `references/script-handler.md` |

---

## Known Gotchas

- **Password-protected PDFs and Word files.** The Read tool returns empty content or a decryption error on protected files. When a non-trivially sized file (> 0 bytes) returns completely empty content, create a stub note with the message "File may be password-protected — content could not be extracted. Unlock the file and re-import."

- **Large PDFs need chunked reading.** Claude's Read tool reads up to 20 pages per request. For PDFs with 20+ pages, read in consecutive page ranges (`pages: "1-20"`, `pages: "21-40"`, etc.) and synthesize across chunks. Without chunking, pages 21+ are silently truncated.

- **`.xls` legacy Excel format.** markitdown may return garbled characters or fail silently on `.xls` files. The Excel stub fallback already has a special message for `.xls` — trust the stub path for `.xls` rather than retrying markitdown. The user should convert to `.xlsx` and re-import.

- **`--attach` flag with batch mode.** In batch mode, `cp` operations for attach run inside subagents. If a subagent's `cp` fails, the orchestrator Step 5 report should include it as a partial failure — the note is created but the attachment copy was skipped.
