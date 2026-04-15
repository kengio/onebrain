---
name: update
description: "Update OneBrain skills, config, and plugins from GitHub : never touches your notes or data"
---

## Install Path Detection

Check if `.claude/plugins/onebrain/` exists in the current vault directory.

**If it does NOT exist:**
> OneBrain is installed as a global plugin but hasn't been adopted into this vault yet.
> Run `/onboarding` first to bundle OneBrain into your vault : after that, `/update` will work normally.

Do not proceed further.

---

# Update OneBrain

Fetch the latest OneBrain system files from GitHub and apply them to this vault.
Your notes, memory, and personal settings are never touched.

---

## Step 0: Version Check

Compare the local plugin version against the remote before prompting the user.

1. Read local version from `.claude/plugins/onebrain/.claude-plugin/plugin.json`
2. Fetch remote version:
   ```bash
   curl -sf "https://raw.githubusercontent.com/kengio/onebrain/main/.claude/plugins/onebrain/.claude-plugin/plugin.json"
   ```
3. Compare:
   - **Same version:** Report `OneBrain is already up to date (vX.Y.Z).` and stop — do not proceed to Step 1.
   - **Remote fetch fails:** Skip this check silently and proceed to Step 1 as normal.
   - **Different version:** Proceed to Step 1, and include the version delta in the prompt: `Update available: vX.Y.Z → vA.B.C. Proceed?`

---

## Step 1: Explain & Confirm

Tell the user what will and won't be updated:

**WILL update (system files only):**
- `.gitignore`
- `.claude/plugins/onebrain/` : all plugin files (skills, hooks, agents, INSTRUCTIONS.md)
- `.claude-plugin/` : local plugin marketplace registry

**WILL NOT touch (your data and preferences):**
- All your note folders (00-inbox through 07-logs) : all your notes
- `[agent_folder]/MEMORY.md` : your identity and session context
- `vault.yml` : your vault configuration
- `.obsidian/` : all Obsidian settings
- `.claude/settings.local.json` : your local Claude settings
- `.claude/onebrain.local.md` : your local plugin config
- `install.sh`, `install.ps1` : fresh-install only, not part of the vault
- `README.md`, `CONTRIBUTING.md`, `LICENSE`, `assets/` : repo-only files

Ask: **"Proceed with update?"** and wait for confirmation before continuing.

---

## Step 2: Compare (Dry-Run)

Detect the platform and run the appropriate script in dry-run mode:

Use the platform reported in your session context (e.g. `Platform: darwin` or `Platform: win32`) to choose the right script. If the platform is Windows, use PowerShell; otherwise use bash.

- **Unix/macOS:**
  ```bash
  bash .claude/plugins/onebrain/skills/update/update.sh
  ```
- **Windows:**
  ```powershell
  powershell -File .claude/plugins/onebrain/skills/update/update.ps1
  ```

> **Note:** The dry-run and apply passes each fetch files independently from GitHub. This is intentional : scripts are stateless and require no temp storage between runs. The window between passes is small enough that mid-run upstream changes are not a practical concern for a personal tool.

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

Run the update script in apply mode (same platform detection as Step 2):

- **Unix/macOS:**
  ```bash
  bash .claude/plugins/onebrain/skills/update/update.sh --apply
  ```
- **Windows** (same platform detection as Step 2):
  ```powershell
  powershell -File .claude/plugins/onebrain/skills/update/update.ps1 -Apply
  ```

If the output contains `status: partial_failure`, report which files failed and advise re-running `/update`.

---

## Step 4b: Migrate MEMORY.md (If Needed)

After applying updates, check for the old MEMORY.md location:

1. Check if `MEMORY.md` exists at the vault root
2. Check if `[agent_folder]/MEMORY.md` exists

**Case A : Root MEMORY.md exists, agent folder MEMORY.md does not:**
- If `[agent_folder]/` does not exist, create it along with `context/` and `memory/` subfolders (each with a `.gitkeep`)
- Copy the content of `MEMORY.md` to `[agent_folder]/MEMORY.md`
- If copy fails: report the error and stop : do not offer to delete the root copy
- If copy succeeds: verify the new file is non-empty, then ask: "Copied MEMORY.md to `[agent_folder]/MEMORY.md`. Can I delete the root copy?"
- Delete root `MEMORY.md` only after confirmation

**Case B : Both exist:**
> Found `MEMORY.md` at the vault root AND at `[agent_folder]/MEMORY.md`. The agent will use `[agent_folder]/MEMORY.md`. Please review and delete the root copy manually: `MEMORY.md`.

**Case C : Only agent folder MEMORY.md exists:** No action.

**Case D : Neither exists:** No action. User will need to run `/onboarding`.

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

Use `[inbox_folder]` from session config. Resolve `[attachments_folder]` from vault.yml (`folders.attachments`; default: `attachments`).

Ensure these folders exist (create with `.gitkeep` if missing, report only new ones):

| Folder | Introduced |
|--------|-----------|
| `[inbox_folder]/imports/` | v1.2.0 |
| `[attachments_folder]/` | v1.2.0 |
| `[attachments_folder]/pdf/` | v1.2.0 |
| `[attachments_folder]/images/` | v1.2.0 |
| `[attachments_folder]/video/` | v1.2.0 |

Also ensure `vault.yml` has these keys under `folders:` (add if missing, never touch `qmd_collection`):

| Key | Value | Introduced |
|-----|-------|-----------|
| `import_inbox` | `[inbox_folder]/imports` | v1.2.0 |
| `attachments` | `attachments` | v1.2.0 |

When inserting missing keys: read the file, insert within the existing `folders:` block (not at end of file), write back the full file. If the `folders:` block is absent, report and skip.

---

## Step 4d: Migrate Plugin Key (onebrain-local → onebrain)

Check `.claude/settings.json` and `.claude/settings.local.json`. For each that exists:
- If the file cannot be read or parsed as JSON: report the error and skip it
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

## Step 4f: Add Checkpoint Config to vault.yml (If Missing)

Read `vault.yml`. If a `checkpoint:` top-level key is **absent**, append this block:

````yaml

checkpoint:
  messages: 15    # auto-checkpoint every N message exchanges
  minutes: 30     # auto-checkpoint every N minutes (whichever comes first)
````

Rules:
- **Never overwrite existing values** : only add the section if entirely absent
- If `vault.yml` does not exist: skip silently
- Report: "Added `checkpoint:` config to `vault.yml` (defaults: 15 messages, 30 min)."
- If already present: skip silently (no output)

---

## Step 4g: Register Stop Checkpoint Hook in Project settings.json (If Missing)

The Stop hook must be registered in the vault's `.claude/settings.json` : it is not picked up from plugin `hooks.json` automatically. This step ensures it is present.

1. Derive the vault root (directory containing `vault.yml`)
2. Set hook path: `[vault_root]/.claude/plugins/onebrain/hooks/checkpoint-hook.sh`
3. Read `.claude/settings.json`:
   - If the file does not exist: treat it as `{}` (the write in step 7 will create it)
   - If the file exists but cannot be parsed as JSON: report error and skip
4. Check if `hooks.Stop` already contains a command referencing `checkpoint-hook.sh stop`. Set `stop_added = false` if already present, `stop_added = true` if added.
5. If **absent**: add the Stop hook entry under `hooks.Stop` (create `hooks` key if missing), set `stop_added = true`:
   ```json
   {
     "matcher": "",
     "hooks": [{ "type": "command", "command": "bash \"[hook_path]\" stop" }]
   }
   ```
6. Check `hooks.PreCompact`:
   - If it contains an entry referencing `checkpoint-hook.sh precompact`: remove that entry; set `precompact_removed = true`
   - If the `PreCompact` array is now empty (or was already empty): remove the `PreCompact` key entirely
7. If `stop_added` OR `precompact_removed`: write the updated JSON back to `.claude/settings.json`, then report:
   - If `stop_added` AND `precompact_removed`: "Registered Stop checkpoint hook and removed legacy PreCompact entry in `.claude/settings.json`. Note: paths are absolute : re-run `/update` if you move this vault."
   - If `stop_added` only: "Registered Stop checkpoint hook in `.claude/settings.json`. Note: paths are absolute : re-run `/update` if you move this vault."
   - If `precompact_removed` only (Stop was already present): "Removed legacy PreCompact checkpoint hook from `.claude/settings.json`."
8. If neither `stop_added` nor `precompact_removed`: skip silently (no output)

---

## Step 5: Report

Show a final summary of everything updated and migrated. Then suggest:

> **Done.** OneBrain has been updated.
>
> Next steps:
> - Run `/reload-plugins` to apply changes immediately in this session
> - Or start a new Claude Code session : changes are picked up automatically
