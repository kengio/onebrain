# Video Handler — Reference

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

Note Template: see `note-template.md`.

1. Collect metadata:
   - Filename (without extension) → use as note title
   - File size: `ls -lh "[filepath]"` via Bash : if the command fails, record size as "unknown"
   - File extension (format type: MP4, MOV, WebM, MKV)

2. Choose output subfolder (suggest `media` or `video`; confirm with user in single-file mode, auto-select in batch mode). Create note using `note-template.md`:
   - `file_type`: `video`
   - Summary: "Video file: [filename]. Format: [extension]. Size: [size]."
   - Key Points: left blank : add context about this video manually

3. `--attach` behavior:
   - Run: `mkdir -p "[vault-root]/[attachments_folder]/video/"`
   - Run: `cp "[filepath]" "[vault-root]/[attachments_folder]/video/[filename]"`
   - If `cp` fails: skip embed, report failure, do NOT delete inbox file, stop
   - Add `![[filename]]` embed above the Summary section

4. Cleanup : only after note creation succeeded AND (if `--attach` was set) `cp` succeeded. If `cp` failed, the handler already stopped; do not reach this step. If the file was inside the inbox folder: `rm "[filepath]"`. If delete fails, report as partial success.

5. Return: note path.
