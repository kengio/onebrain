# Word Handler (.docx) — Reference

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

Requires `markitdown` — see `markitdown-setup.md` for detection/install procedure.
Note Template: see `note-template.md`.

1. Check markitdown is available : follow `markitdown-setup.md`. If the dependency flow could not install markitdown, skip to step 5 (stub note).

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

4. Choose output subfolder (same rule as PDF Handler : including single-file confirmation). Create note using `note-template.md`:
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
