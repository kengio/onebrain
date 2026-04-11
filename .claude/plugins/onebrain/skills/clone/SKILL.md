---
name: clone
description: Clone your agent's portable context (agent folder including MEMORY.md) to a folder for transfer to another vault
---

# Clone

Package your agent's full context for transfer to a new vault.

**What gets cloned:** Everything in the agent folder : `MEMORY.md`, `context/`, `memory/`, and `CLONE.md` once generated.
**What does NOT get cloned:** your notes, projects, areas, knowledge, resources, archive, and logs.

Usage: `/clone`

---

## Step 1: Read vault.yml

If vault.yml exists, read it and extract `folders.agent`. Default to `05-agent` if the file does not exist or the key is absent.
Set `agent_folder` for all paths below.

---

## Step 2: Regenerate CLONE.md

Write `[agent_folder]/CLONE.md` (overwrite if it exists):

```markdown
---
tags: [agent-clone]
updated: YYYY-MM-DD
---

# Agent Clone Manifest

## Identity
- Source: [agent_folder]/MEMORY.md
- Agent name: [read from [agent_folder]/MEMORY.md Agent Identity section]
- Last updated: [TODAY'S DATE]

## Context Notes
[For each .md file in agent_folder/context/ (skip .gitkeep and non-.md files), list: - filename : first line of file body (after frontmatter). If no .md files exist, write: (none yet)]

## Memory Notes
[For each .md file in agent_folder/memory/ (skip .gitkeep and non-.md files), list: - filename : first line of file body (after frontmatter). If no .md files exist, write: (none yet)]
```

---

## Step 3: Display Clone Summary

Show the user what will be cloned:
> **Ready to clone:**
> - `[agent_folder]/MEMORY.md` : identity and personality
> - `[agent_folder]/CLONE.md` : this manifest
> - `[agent_folder]/context/` : N files
> - `[agent_folder]/memory/` : N files
>
> **Not cloned:** your notes, projects, areas, knowledge, resources, archive, logs.

---

## Step 4: Ask Clone Method

Ask:
> How would you like to clone?
> 1. **Folder copy** : I'll create `agent-clone-YYYY-MM-DD/` in your vault root with all files ready to copy
> 2. **Display paths** : I'll list the file paths so you can copy them manually

---

## Step 5a: Folder Copy

If the user chose option 1:

1. Determine output folder: `agent-clone-YYYY-MM-DD/`
2. If that folder already exists, append a counter: `agent-clone-YYYY-MM-DD-02/`, `-03/`, etc. Keep incrementing until you find a name that does not exist.
3. Create the output folder
4. Copy entire `[agent_folder]/` to `[output_folder]/[agent_folder]/` preserving all subfolders and files (including CLONE.md and MEMORY.md)
5. Confirm:
   > Your agent context is ready at `[output_folder]/`.
   > Copy `[agent_folder]/` to your new vault root to restore context.
   > **Prerequisite:** Your new vault must have OneBrain installed before importing.
   > To import: place `[agent_folder]/` at the vault root : MEMORY.md is inside.

---

## Step 5b: Display Paths

If the user chose option 2:

Print a markdown code block listing every file's relative path:
```
[agent_folder]/MEMORY.md
[agent_folder]/CLONE.md
[agent_folder]/context/[each file]
[agent_folder]/memory/[each file]
```

Then say:
> Copy the `[agent_folder]/` folder to your new vault root.
> Your new vault needs to have OneBrain installed for the agent to work.
