---
name: clone
description: "Clone your agent's portable context (agent folder including MEMORY.md) to a folder for transfer to another vault"
---

# Clone

Package your agent's full context for transfer to a new vault.

**What gets cloned:** Everything in the agent folder : `MEMORY.md`, `INDEX.md`, `memory/`, and `CLONE.md` once generated. Also includes `vault.yml` and the OneBrain plugin.
**What does NOT get cloned:** your notes, projects, areas, knowledge, resources, archive, and logs.

Usage: `/clone`

---

## Files Included in Clone Package

- `05-agent/MEMORY.md`
- `05-agent/INDEX.md`          ← include INDEX
- `05-agent/memory/`           ← all memory files (was: context/ + memory/ separately; now merged)
- `vault.yml`                  ← include vault.yml (has recap config)
- `.claude/plugins/onebrain/`

---

## Session Log Handling

When cloning, preserve `recapped:` and `topics:` fields on all session logs.
Do NOT strip these fields — the new vault should not reprocess already-recapped logs.

---

## Archive Folder Option

AskUserQuestion: "Include `[archive_folder]/[agent_folder]/memory/` (deleted memory files)?"
Options: `include / skip`
- `include`: copy `06-archive/05-agent/memory/` into clone package (full history)
- `skip`: omit archive folder (clean fresh-feeling vault)

---

## Step 1: Regenerate CLONE.md

Write `[agent_folder]/CLONE.md` (overwrite if it exists):

```markdown
---
tags: [agent-clone]
updated: YYYY-MM-DD
---

# Agent Clone Manifest

## Identity
- Source: [agent_folder]/MEMORY.md
- Agent name: [read from [agent_folder]/MEMORY.md `## Identity & Personality` section — value of **Agent:** field]
- Last updated: [TODAY'S DATE]

## Index
[If [agent_folder]/INDEX.md exists, include a note that INDEX.md is present. Otherwise write: (none)]

## Memory Notes
[For each .md file in agent_folder/memory/ (skip .gitkeep and non-.md files), list: - filename : first line of file body (after frontmatter). If no .md files exist, write: (none yet)]
```

---

## Step 2: Display Clone Summary

Show the user what will be cloned:
──────────────────────────────────────────────────────────────
📦 Ready to Clone
──────────────────────────────────────────────────────────────
✅  `[agent_folder]/MEMORY.md`      identity and personality
✅  `[agent_folder]/INDEX.md`       memory index
✅  `[agent_folder]/CLONE.md`       this manifest
✅  `[agent_folder]/memory/`        {N} files
✅  `vault.yml`                     vault configuration
✅  `.claude/plugins/onebrain/`     OneBrain plugin

❌  notes, projects, areas, knowledge, resources, archive, logs

---

## Step 3: Ask Clone Method

Ask:
> How would you like to clone?
> 1. **Folder copy** : I'll create `agent-clone-YYYY-MM-DD/` in your vault root with all files ready to copy
> 2. **Display paths** : I'll list the file paths so you can copy them manually

---

## Step 4a: Folder Copy

If the user chose option 1:

1. Determine output folder: `agent-clone-YYYY-MM-DD/`
2. If that folder already exists, append a counter: `agent-clone-YYYY-MM-DD-02/`, `-03/`, etc. Keep incrementing until you find a name that does not exist.
3. Create the output folder
4. Copy the following into the output folder, preserving all subfolders and files:
   - Entire `[agent_folder]/` to `[output_folder]/[agent_folder]/` (including CLONE.md, MEMORY.md, INDEX.md, memory/)
   - `vault.yml` to `[output_folder]/vault.yml`
   - `.claude/plugins/onebrain/` to `[output_folder]/.claude/plugins/onebrain/`
   - If archive included: `[archive_folder]/[agent_folder]/memory/` to `[output_folder]/[archive_folder]/[agent_folder]/memory/`
5. Confirm:
   ✅ Agent context ready at `{output_folder}/`.
   Copy its contents to your new vault root to restore context.
   Prerequisite: new vault must have OneBrain installed before importing.
   → To import: place `[agent_folder]/` at the vault root — MEMORY.md is inside.

---

## Step 4b: Display Paths

If the user chose option 2:

Print a markdown code block listing every file's relative path:
```
[agent_folder]/MEMORY.md
[agent_folder]/INDEX.md
[agent_folder]/CLONE.md
[agent_folder]/memory/[each file]
vault.yml
.claude/plugins/onebrain/
```

Then say:
> Copy the listed files/folders to your new vault root.
> Your new vault needs to have OneBrain installed for the agent to work.
