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

- Ensure the directory `[vault-root]/[attachments_folder]/images/` exists. Most reliable across shells is Node (already on PATH because the CLI requires it):
  ```
  node -e "require('fs').mkdirSync(process.argv[1], { recursive: true })" -- "[vault-root]/[attachments_folder]/images/"
  ```
  Native shell forms also work if the active shell is known: `mkdir -p <dir>` on Bash, `New-Item -ItemType Directory -Force <dir>` on PowerShell, `mkdir <dir>` on cmd. **Do not** call `mkdir -p` from PowerShell — its `mkdir` function alias treats `-p` as a positional child name and creates a directory literally named `-p`.
- Copy `[filepath]` to `[vault-root]/[attachments_folder]/images/[filename]`. Use `cp` on Bash, `Copy-Item` on PowerShell, `copy` on cmd.
- If the copy fails: skip embed, report failure, do NOT delete inbox file, stop
- Add `![[filename]]` embed above the Summary section in the note

## Cleanup

Only after note creation succeeded AND (if `--attach` was set) the copy succeeded. If the copy failed, the handler already stopped; do not reach this step. If the file was inside the inbox folder: remove `[filepath]` (`rm` on Bash, `Remove-Item` on PowerShell, `del` on cmd). If delete fails, report as partial success.

**Return:** Note path, or error with reason.
