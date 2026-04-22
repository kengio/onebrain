# Image / GIF / SVG Handler — Reference

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

Note Template: see `note-template.md`.

## Visual Images (PNG, JPG, JPEG, GIF, WebP)

1. Read the image using the Read tool. Claude is multimodal and can describe images visually.

2. Generate a description covering:
   - What the image shows (subject, composition, colors, style)
   - Notable elements or text visible in the image
   - Likely purpose or context (e.g., diagram, screenshot, photo, illustration)

3. Choose output subfolder (suggest `media`, `images`, or topic-based; confirm with user in single-file mode, auto-select in batch mode). Create note using `note-template.md`:
   - `file_type`: `image`
   - Summary: the visual description from step 2
   - Key Points: notable elements, any visible text, inferred purpose

## SVG (vector graphics : treated as structured XML, not visual)

1. Read the SVG file as text using the Read tool.

2. Describe:
   - What the SVG represents (icon, diagram, illustration, chart)
   - Key structural elements (paths, shapes, text, groups)
   - Likely use case

3. Create note same as above (same subfolder selection rule), but with `file_type`: `svg`.

## --attach behavior (all image types including SVG)

- Run: `mkdir -p "[vault-root]/[attachments_folder]/images/"`
- Run: `cp "[filepath]" "[vault-root]/[attachments_folder]/images/[filename]"`
- If `cp` fails: skip embed, report failure, do NOT delete inbox file, stop
- Add `![[filename]]` embed above the Summary section in the note

## Cleanup

Only after note creation succeeded AND (if `--attach` was set) `cp` succeeded. If `cp` failed, the handler already stopped; do not reach this step. If the file was inside the inbox folder: `rm "[filepath]"`. If delete fails, report as partial success.

**Return:** Note path, or error with reason.
