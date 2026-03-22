---
name: export
description: Export your agent's portable context (MEMORY.md + agent folder) to a folder for transfer to another vault
---

# Export

Package your agent's full context for transfer to a new vault.

**What gets exported:** `MEMORY.md` and everything in the agent folder (context/, memory/, and EXPORT.md once generated).
**What does NOT get exported:** your notes, projects, areas, knowledge, resources, archive, and logs.

Usage: `/export`

---

## Step 1: Read vault.yml

If vault.yml exists, read it and extract `folders.agent`. Default to `05-agent` if the file does not exist or the key is absent.
Set `agent_folder` for all paths below.

---

## Step 2: Regenerate EXPORT.md

Write `[agent_folder]/EXPORT.md` (overwrite if it exists):

```markdown
---
tags: [agent-export]
updated: YYYY-MM-DD
---

# Agent Export Manifest

## Identity
- Source: MEMORY.md
- Agent name: [read from MEMORY.md Agent Identity section]
- Last updated: [TODAY'S DATE]

## Context Notes
[For each file in agent_folder/context/, list: - filename — first line of file body (after frontmatter)]

## Memory Notes
[For each file in agent_folder/memory/, list: - filename — first line of file body (after frontmatter)]
```

---

## Step 3: Display Export Summary

Show the user what will be exported:
> **Ready to export:**
> - `MEMORY.md` — identity and personality
> - `[agent_folder]/EXPORT.md` — this manifest
> - `[agent_folder]/context/` — N files
> - `[agent_folder]/memory/` — N files
>
> **Not exported:** your notes, projects, areas, knowledge, resources, archive, logs.

---

## Step 4: Ask Export Method

Ask:
> How would you like to export?
> 1. **Folder copy** — I'll create `agent-export-YYYY-MM-DD/` in your vault root with all files ready to copy
> 2. **Display paths** — I'll list the file paths so you can copy them manually

---

## Step 5a: Folder Copy

If the user chose option 1:

1. Determine output folder: `agent-export-YYYY-MM-DD/`
2. If that folder already exists, append a counter: `agent-export-YYYY-MM-DD-02/`, `-03/`, etc.
3. Create the output folder
4. Copy `MEMORY.md` to `[output_folder]/MEMORY.md`
5. Copy entire `[agent_folder]/` to `[output_folder]/[agent_folder]/` preserving all subfolders and files (including EXPORT.md)
6. Confirm:
   > Your agent context is ready at `[output_folder]/`.
   > Copy this folder's contents to your new vault root to restore context.
   > To import: place `MEMORY.md` at the vault root and `[agent_folder]/` in the same location.

---

## Step 5b: Display Paths

If the user chose option 2:

Print a markdown code block listing every file's relative path:
```
MEMORY.md
[agent_folder]/EXPORT.md
[agent_folder]/context/[each file]
[agent_folder]/memory/[each file]
```

Then say:
> Copy these files to the same relative paths in your new vault.
> Your new vault needs to have OneBrain installed for the agent to work.
