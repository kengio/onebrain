# Excel Handler (.xlsx / .xls) — Reference

Executed by a subagent. Inputs: file path, vault root, inbox flag. (`--attach` not supported)

Requires `markitdown` — see `markitdown-setup.md` for detection/install procedure.
Note Template: see `note-template.md`.

1. Check markitdown is available : follow `markitdown-setup.md`. If the dependency flow could not install markitdown, skip to step 5 (stub note).

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

4. Choose output subfolder (same rule as PDF Handler : including single-file confirmation). Create note using `note-template.md`:
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
