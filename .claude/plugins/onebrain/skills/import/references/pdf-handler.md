# PDF Handler — Reference

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

Handler Safety Rules: see `../SKILL.md` — Handler Safety Rules section.
Note Template: see `note-template.md`.

1. Read the PDF file using the Read tool. Claude can read PDFs natively up to 20 pages per request. For large PDFs, read in page ranges.

2. Extract:
   - **Title**: from the document title or first heading, or derive from filename
   - **Author**: if present in metadata or document
   - **Key sections**: major headings and their main points
   - **Core thesis or purpose**: what is this document fundamentally about?

3. Choose output subfolder:
   - Glob existing subfolders in `[resources_folder]/*/` (resolved from vault.yml)
   - Pick a kebab-case subfolder matching the document's topic (e.g. `research`, `finance`, `legal`)
   - Prefer an existing subfolder if the topic matches; create a new one only if none fit
   - **Single-file mode**: confirm with user: "I'd file this under `[resources_folder]/[suggested]/`. OK?"
   - **Batch mode**: auto-select without confirmation (user confirms all files in Step 3 of orchestrator)
   - File name: title-cased derivation of the document title (or filename if no title)

4. Create note at `[resources_folder]/[subfolder]/[Title].md` using `note-template.md`:
   - `file_type`: `pdf`
   - Summary: 2-3 sentence distillation of the document's purpose and key findings
   - Key Points: bullet list of 3-7 main points from the document

5. If `--attach` flag is set:
   - Run: `mkdir -p "[vault-root]/[attachments_folder]/pdf/"`
   - Run: `cp "[filepath]" "[vault-root]/[attachments_folder]/pdf/[filename]"`
   - If `cp` fails: skip embed, report failure, do NOT delete inbox file, stop
   - Add `![[filename]]` embed to the note body (above the Summary section)

6. Cleanup : only if step 4 (note creation) succeeded:
   - If the file was inside the inbox folder: `rm "[filepath]"`
   - If the file was an explicit path outside the inbox: do NOT delete it
   - If delete fails: report as partial success (note created, manual delete needed)

7. Return: note path, or error with reason
