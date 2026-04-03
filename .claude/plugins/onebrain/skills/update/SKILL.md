---
name: update
description: Update OneBrain skills, config, and plugins from GitHub — never touches your notes or data
---

## Install Path Detection

Check if `.claude/plugins/onebrain/` exists in the current vault directory.

**If it does NOT exist:**
> OneBrain is installed as a global plugin but hasn't been adopted into this vault yet.
> Run `/onboarding` first to bundle OneBrain into your vault — after that, `/update` will work normally.

Do not proceed further.

---

# Update OneBrain

Fetch the latest OneBrain system files from GitHub and apply them to this vault.
Your notes, memory, and personal settings are never touched.

---

## Step 1: Explain & Confirm

Tell the user what will and won't be updated:

**WILL update (system files only):**
- `.gitignore`
- `.claude/plugins/onebrain/` — all plugin files (skills, hooks, agents, INSTRUCTIONS.md)
- `.claude-plugin/` — local plugin marketplace registry

**WILL NOT touch (your data and preferences):**
- All your note folders (00-inbox through 07-logs) — all your notes
- `[agent_folder]/MEMORY.md` — your identity and session context
- `vault.yml` — your vault configuration
- `.obsidian/` — all Obsidian settings
- `.claude/settings.local.json` — your local Claude settings

Ask: **"Proceed with update?"** and wait for confirmation before continuing.

---

## Step 2: Compare (Dry-Run)

Run the update script in dry-run mode:

```bash
bash .claude/plugins/onebrain/skills/update/update.sh
```

Parse the output and present a summary to the user:

> Found: N modified, N new, N deleted, N unchanged.
> Modified: [list files marked with ~]
> New: [list files marked with +]
> Deleted: [list files marked with -]
>
> Apply these updates?

If the output contains `status: partial_failure` or any lines starting with `!`, stop and report which files failed to fetch. Tell the user to re-run `/update` to retry.

Wait for confirmation before continuing.

---

## Step 3: Apply

Run the update script in apply mode:

```bash
bash .claude/plugins/onebrain/skills/update/update.sh --apply
```

If the output contains `status: partial_failure`, report which files failed and advise re-running `/update`.

---

## Step 4b: Migrate MEMORY.md (If Needed)

After applying updates, check for the old MEMORY.md location:

1. Read `vault.yml` to determine `agent_folder` (default: `05-agent`)
2. Check if `MEMORY.md` exists at the vault root
3. Check if `[agent_folder]/MEMORY.md` exists

**Case A — Root MEMORY.md exists, agent folder MEMORY.md does not:**
- If `[agent_folder]/` does not exist, create it along with `context/` and `memory/` subfolders (each with a `.gitkeep`)
- Copy the content of `MEMORY.md` to `[agent_folder]/MEMORY.md`
- If copy fails: report the error and stop — do not offer to delete the root copy
- If copy succeeds: verify the new file is non-empty, then ask: "Copied MEMORY.md to `[agent_folder]/MEMORY.md`. Can I delete the root copy?"
- Delete root `MEMORY.md` only after confirmation

**Case B — Both exist:**
> Found `MEMORY.md` at the vault root AND at `[agent_folder]/MEMORY.md`. The agent will use `[agent_folder]/MEMORY.md`. Please review and delete the root copy manually: `MEMORY.md`.

**Case C — Only agent folder MEMORY.md exists:** No action.

**Case D — Neither exists:** No action. User will need to run `/onboarding`.

---

## Step 4b-ii: Patch MEMORY.md Frontmatter (If Needed)

Ensure `[agent_folder]/MEMORY.md` has correct frontmatter (skip if file doesn't exist):

**Required fields:**
```yaml
---
tags: [agent-memory]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

- If frontmatter is malformed (opening `---` with no closing `---`): report and skip
- If frontmatter is missing: prepend the block above (use today's date for both fields)
- If frontmatter is present but incomplete: insert only the missing keys
- If frontmatter is complete: skip silently

---

## Step 4c: Create Missing Vault Folders

Resolve `[inbox]` from `vault.yml` `folders.inbox` (default: `00-inbox`) and `[attachments]` from `vault.yml` `folders.attachments` (default: `attachments`) — both were already read in Step 4b.

Ensure these folders exist (create with `.gitkeep` if missing, report only new ones):

| Folder | Introduced |
|--------|-----------|
| `[inbox]/imports/` | v1.2.0 |
| `[attachments]/` | v1.2.0 |
| `[attachments]/pdf/` | v1.2.0 |
| `[attachments]/images/` | v1.2.0 |
| `[attachments]/video/` | v1.2.0 |

Also ensure `vault.yml` has these keys under `folders:` (add if missing, never touch `qmd_collection`):

| Key | Value | Introduced |
|-----|-------|-----------|
| `import_inbox` | `[inbox]/imports` | v1.2.0 |
| `attachments` | `attachments` | v1.2.0 |

---

## Step 4d: Migrate Plugin Key (onebrain-local → onebrain)

Check `.claude/settings.json` and `.claude/settings.local.json`. For each that exists:
- Rename `"onebrain@onebrain-local"` → `"onebrain@onebrain"` in `enabledPlugins`
- Rename `"onebrain-local"` → `"onebrain"` in `extraKnownMarketplaces`
- If both old and new keys exist: remove the old one
- Report: "Migrated stale marketplace keys in `[file]`."

---

## Step 4e: Migrate Instruction Files to @import (If Needed)

The @import line: `@.claude/plugins/onebrain/INSTRUCTIONS.md`

**CLAUDE.md:**
- Does not exist → create with just the @import line
- Already has @import line → skip
- Has `# OneBrain` heading → replace the OneBrain block with @import line (preserve any user content above it)
- Other content, no @import → append @import line at the end

**GEMINI.md and AGENTS.md:**
- Does not exist → create with just the @import line
- Already has @import line → skip
- Any other content → replace entire file with @import line

---

## Step 5: Report

Show a final summary of everything updated and migrated. Then suggest:

> **Done.** OneBrain has been updated.
>
> Next steps:
> - Run `/reload-plugins` to apply changes immediately in this session
> - Or start a new Claude Code session — changes are picked up automatically
