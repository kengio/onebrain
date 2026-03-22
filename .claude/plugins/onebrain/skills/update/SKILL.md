---
name: update
description: Update OneBrain skills, config, and plugins from GitHub — never touches your notes or data
---

# Update OneBrain

Fetch the latest OneBrain system files from GitHub and apply them to this vault.
Your notes, memory, and personal settings are never touched.

---

## Step 1: Explain & Confirm

Tell the user what will and won't be updated:

**WILL update (system files only):**
- `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `README.md`, `.gitignore`
- `.claude/plugins/onebrain/` — all skills, hooks, and agents
- `.claude/plugins/obsidian-skills/` — Obsidian Skills plugin (kepano/obsidian-skills)
- `.obsidian/plugins/` — bundled plugin files
- `.obsidian/app.json`, `.obsidian/core-plugins.json`, `.obsidian/community-plugins.json`

**WILL NOT touch (your data and preferences):**
- All your note folders (inbox, projects, knowledge, archive, logs — exact names depend on your vault method; see `vault.yml`) — all your notes
- `MEMORY.md` — your identity and session context
- `vault.yml` — your vault method configuration
- `.obsidian/themes/` — your chosen theme
- `.obsidian/appearance.json` — your theme preference
- `.obsidian/workspace.json` — your panel layout
- `.obsidian/hotkeys.json` — your keybindings
- `.claude/settings.local.json` — your local Claude settings
- `.claude/onebrain.local.md` — your local plugin config
- `install.sh` — only used for fresh installs

Ask: **"Proceed with update?"** and wait for confirmation before continuing.

---

## Step 2: Fetch Upstream File List

Use WebFetch to retrieve the full file tree from the OneBrain repository:

`https://api.github.com/repos/kengio/onebrain/git/trees/main?recursive=1`

Parse the JSON response. The `tree` array contains every file (`type: "blob"`) and directory (`type: "tree"`) in the repo, each with a `path` field.

If this request fails (network error, API rate limit), tell the user and stop.

---

## Step 3: Compare & Report

For each path in the allowlist, compare the upstream version against the local version. Collect results into three buckets: **modified**, **new**, **unchanged**.

**Allowlist — paths to check and potentially update:**

| Path | Type |
|------|------|
| `CLAUDE.md` | file |
| `GEMINI.md` | file |
| `AGENTS.md` | file |
| `README.md` | file |
| `.gitignore` | file |
| `.claude/plugins/onebrain/` | directory |
| `.obsidian/plugins/` | directory |
| `.obsidian/app.json` | file |
| `.obsidian/core-plugins.json` | file |
| `.obsidian/community-plugins.json` | file |

**For individual files:** Fetch the upstream content using WebFetch:
`https://raw.githubusercontent.com/kengio/onebrain/main/[path]`
Read the local file with the Read tool and compare. Mark as `unchanged`, `modified`, or `new` (if the local file doesn't exist yet).

**For directories:** Filter the upstream file tree (from Step 2) to all blobs whose path starts with the directory prefix. For each upstream file:
- Fetch its content from `https://raw.githubusercontent.com/kengio/onebrain/main/[path]`
- Read the local file with the Read tool and compare
- Mark as `unchanged`, `modified`, or `new`

Also identify **local files that no longer exist upstream** (present locally but absent from the upstream tree for that directory prefix). These will be deleted in Step 4 to keep the directory in sync.

Present the summary before asking to apply. Example:
> Found: 2 modified, 1 new, 7 unchanged.
> Modified: `.claude/plugins/onebrain/`, `CLAUDE.md`
> New: `.obsidian/plugins/new-plugin/`
>
> Apply these updates?

Wait for confirmation.

---

## Step 4: Apply Updates

After user confirms, apply each changed or new item from the allowlist using the Write tool:

**For individual files:** Write the upstream content (fetched in Step 3) to the local path.

**For directories:**
- Write each upstream file that is `modified` or `new` to its local path.
- Delete any local files identified as no longer existing upstream (removed from the repo). This keeps plugin and skill directories clean when files are renamed or removed.

Only modify files that are in the allowlist. Never touch note folders, `MEMORY.md`, `vault.yml`, or any user preference files.

---

## Step 5.5: Re-apply Vault Method Customizations

Read `vault.yml` to check the configured method (`method:` key). If `vault.yml` doesn't exist or the method is `onebrain`, skip this step.

Otherwise, read the folder mapping from `vault.yml` and re-apply replacements to all updated system files. This ensures fresh upstream files get the correct folder names for the user's chosen method.

The onboarding and update skill files must NOT be modified — they contain hardcoded default folder names as templates required for future runs.

Use your file editing tools (Read, Edit) to make these replacements — do not use shell commands. This ensures the step works on all platforms (macOS, Linux, Windows).

From `vault.yml`, read the `folders` mapping:
- `folders.inbox` → INBOX
- `folders.projects` → PROJECTS
- `folders.knowledge` → KNOWLEDGE
- `folders.archive` → ARCHIVE
- `folders.logs` → MEMLOG

**In `CLAUDE.md`, `GEMINI.md`, and `AGENTS.md`, replace all occurrences of:**
- `00-inbox/` → `[INBOX]/`
- `01-projects/` → `[PROJECTS]/`
- `02-knowledge/` → `[KNOWLEDGE]/`
- `03-archive/` → `[ARCHIVE]/`
- `04-logs/` → `[MEMLOG]/`

**If method is `para`, also in `CLAUDE.md`, `GEMINI.md`, and `AGENTS.md`:**
- Replace "Consolidated notes, insights, and reference material" → "Topics of interest and reference material"
- Replace "Completed projects and old items" → "Inactive items from any category"
- Replace "Completed projects and archived items" → "Inactive items from any category"
- Insert `02-areas/        Ongoing responsibilities (health, finance, career)` after the `01-projects/` line in `CLAUDE.md`, `GEMINI.md`, and `AGENTS.md` vault structure code blocks (if not already present)

**If method is `zettelkasten`, also in `CLAUDE.md`, `GEMINI.md`, and `AGENTS.md`:**
- Replace "Raw braindumps and quick captures (process regularly)" → "Temporary capture — raw ideas and quick notes"
- Replace "Active projects with tasks and notes" → "Notes from sources you've read"
- Replace "Consolidated notes, insights, and reference material" → "Atomic, linked notes — your knowledge graph"

**In all `.md` files under `.claude/plugins/onebrain/` (excluding `skills/onboarding/SKILL.md` and `skills/update/SKILL.md`), replace all occurrences of:**
- `00-inbox/` → `[INBOX]/`
- `01-projects/` → `[PROJECTS]/`
- `02-knowledge/` → `[KNOWLEDGE]/`
- `03-archive/` → `[ARCHIVE]/`
- `04-logs/` → `[MEMLOG]/`

Display name mapping for the completion message: `onebrain` → OneBrain, `para` → PARA, `zettelkasten` → Zettelkasten.

Tell the user: "Re-applied [display name] folder customizations to updated files."

---

## Step 5.6: Update Obsidian Skills Plugin

Update the kepano/obsidian-skills plugin to the latest version.

**If `.claude/plugins/obsidian-skills/` does NOT exist:**

Ask the user:
> The Obsidian Skills plugin is not installed. Would you like to install it now?

If yes:
1. Run: `git clone --depth 1 https://github.com/kepano/obsidian-skills.git .claude/plugins/obsidian-skills`
   - If the clone fails: warn the user, clean up `obsidian-skills/` unconditionally (it may be partially created), and skip this step.
2. Remove `.claude/plugins/obsidian-skills/.git`:
   - If this fails: warn the user. Tell them to either remove the whole directory and re-run `/update` (`rm -rf .claude/plugins/obsidian-skills/`), or if they know the skill files are complete, remove only the nested `.git` (`rm -rf .claude/plugins/obsidian-skills/.git`). Skip this step.

If no, skip this step.

**If `.claude/plugins/obsidian-skills/` exists:**

First check: if `.claude/plugins/obsidian-skills/.git` still exists (incomplete previous install), stop and tell the user to remove the whole directory and re-run `/update`: `rm -rf .claude/plugins/obsidian-skills/` — or, if the skill files are known complete, remove only the nested `.git`: `rm -rf .claude/plugins/obsidian-skills/.git`.

Otherwise, since the `.git` directory was removed at install time, update by re-cloning to a temp location first, then swapping:

1. Clone to temp: `git clone --depth 1 https://github.com/kepano/obsidian-skills.git .claude/plugins/obsidian-skills-new`
   - If the clone fails: warn the user, keep the existing version intact, and stop. Clean up `obsidian-skills-new` unconditionally. If that cleanup also fails, warn the user to remove it manually (`rm -rf .claude/plugins/obsidian-skills-new`) before the next update attempt.

2. Remove `.claude/plugins/obsidian-skills-new/.git`:
   - If this fails: warn the user, keep the existing version intact, and stop. Clean up `obsidian-skills-new`.

3. Delete `.claude/plugins/obsidian-skills/`:
   - If this fails: warn the user, keep both directories, and stop. Tell the user to manually remove `obsidian-skills/` and rename `obsidian-skills-new` to `obsidian-skills`.

4. Rename `obsidian-skills-new` → `obsidian-skills`:
   - If this fails (e.g., cross-device move): warn the user that the old directory was removed and the new one is at `obsidian-skills-new`. Tell the user to manually rename it: `mv .claude/plugins/obsidian-skills-new .claude/plugins/obsidian-skills`

Report: "Obsidian Skills plugin updated to latest version." on success, or the specific failure message if any step failed.

---

## Step 6: Report

Show a final summary of what was updated. Then suggest:

> **Done.** OneBrain has been updated.
>
> Next steps:
> - **Restart Obsidian** if any plugins were updated (`.obsidian/plugins/` changed)
> - **Restart your AI session** if system instructions changed (`CLAUDE.md`, `GEMINI.md`, or `AGENTS.md`)
