# Script Handler — Reference

Executed by a subagent. Inputs: file path, vault root, inbox flag.

Handles: `.py`, `.sh`, `.bash`, `.zsh`, `.sql`

Note Template: see `note-template.md`.

1. Read the file content verbatim using the Read tool.
   - If Read returns an error or empty output: return an error ("Could not read [filename] : file may be empty or unreadable. File left in inbox."). Do NOT create a note. Do NOT delete inbox file. Stop.

2. Analyze the script:
   - **Purpose**: what does this script do? (1-2 sentences)
   - **Inputs**: what does it take as arguments or reads from? (files, env vars, stdin)
   - **Outputs**: what does it produce? (files, stdout, database changes)
   - **Key logic**: notable algorithms, external dependencies, or non-obvious behavior

3. Choose output subfolder (suggest `scripts`, or topic-based like `data-processing`; confirm with user in single-file mode, auto-select in batch mode). Create note using `note-template.md`:
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
