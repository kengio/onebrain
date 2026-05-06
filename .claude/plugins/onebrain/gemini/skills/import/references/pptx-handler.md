# PowerPoint Handler (.pptx / .ppt) — Reference

Executed by a subagent. Inputs: file path, vault root, inbox flag. (`--attach` not supported)

Requires `markitdown` — see `markitdown-setup.md` for detection/install procedure.
Note Template: see `note-template.md`.

1. Check markitdown is available : follow `markitdown-setup.md`. If the dependency flow could not install markitdown, skip to step 5 (stub note).

2. Extract markdown:
   ```bash
   markitdown "[filepath]"
   ```
   - If exit non-zero OR output is empty/whitespace: skip to step 5 (stub note, reason: "markitdown failed or presentation is empty").
   - Otherwise capture the output as markdown text.

3. From the extracted markdown, create a slide outline:
   - markitdown maps slide titles to `##` headings : use these as the slide structure
   - The `## Slide Outline` section is populated from these headings and their content

4. Choose output subfolder (same rule as PDF Handler : including single-file confirmation). Create note using `note-template.md`:
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
