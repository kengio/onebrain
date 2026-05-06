# Video Handler — Reference

Executed by a subagent. Inputs: file path, vault root, `--attach` flag, inbox flag.

Note Template: see `note-template.md`.

1. Collect metadata:
   - Filename (without extension) → use as note title
   - File size in bytes — call Node (already required by the OneBrain CLI, so reliably on PATH). Pass the path via `process.argv` so Windows backslashes are not interpreted as escape sequences inside a string literal. The `catch` arm logs the errno code to stderr (visible in tool output) so the agent can surface a real cause when the stat fails:
     ```
     node -e "try { console.log(require('fs').statSync(process.argv[1]).size) } catch (e) { console.error(e.code || e.message); console.log('unknown') }" -- "[filepath]"
     ```
     If stdout is `unknown`, record size as "unknown" and proceed (the stderr line tells the agent which errno fired, in case it's actionable).
   - File extension (format type: MP4, MOV, WebM, MKV)

2. Choose output subfolder (suggest `media` or `video`; confirm with user in single-file mode, auto-select in batch mode). Create note using `note-template.md`:
   - `file_type`: `video`
   - Summary: "Video file: [filename]. Format: [extension]. Size: [size]."
   - Key Points: left blank : add context about this video manually

3. `--attach` behavior:
   - Ensure the directory `[vault-root]/[attachments_folder]/video/` exists. Prefer Node (portable across Bash/PowerShell/cmd):
     ```
     node -e "require('fs').mkdirSync(process.argv[1], { recursive: true })" -- "[vault-root]/[attachments_folder]/video/"
     ```
     Native shell forms also work if the active shell is known: `mkdir -p <dir>` on Bash, `New-Item -ItemType Directory -Force <dir>` on PowerShell, `mkdir <dir>` on cmd. **Do not** call `mkdir -p` from PowerShell.
   - Copy `[filepath]` to `[vault-root]/[attachments_folder]/video/[filename]` (`cp` on Bash, `Copy-Item` on PowerShell, `copy` on cmd).
   - If the copy fails: skip embed, report failure, do NOT delete inbox file, stop
   - Add `![[filename]]` embed above the Summary section

4. Cleanup : only after note creation succeeded AND (if `--attach` was set) the copy succeeded. If the copy failed, the handler already stopped; do not reach this step. If the file was inside the inbox folder: remove `[filepath]` (`rm` on Bash, `Remove-Item` on PowerShell, `del` on cmd). If delete fails, report as partial success.

5. Return: note path.
