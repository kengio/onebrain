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
- `.obsidian/plugins/` — bundled plugin files
- `.obsidian/app.json`, `.obsidian/core-plugins.json`, `.obsidian/community-plugins.json`

**WILL NOT touch (your data and preferences):**
- All your note folders (inbox, projects, knowledge, archive, memory log — exact names depend on your vault method; see `vault.yml`) — all your notes
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
- `folders.memory_log` → MEMLOG

**In `CLAUDE.md`, `GEMINI.md`, and `AGENTS.md`, replace all occurrences of:**
- `00-inbox/` → `[INBOX]/`
- `01-projects/` → `[PROJECTS]/`
- `02-knowledge/` → `[KNOWLEDGE]/`
- `03-archive/` → `[ARCHIVE]/`
- `04-memory-log/` → `[MEMLOG]/`

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
- `04-memory-log/` → `[MEMLOG]/`

Display name mapping for the completion message: `onebrain` → OneBrain, `para` → PARA, `zettelkasten` → Zettelkasten.

Tell the user: "Re-applied [display name] folder customizations to updated files."

---

## Step 6: Report

Show a final summary of what was updated. Then suggest:

> **Done.** OneBrain has been updated.
>
> Next steps:
> - **Restart Obsidian** if any plugins were updated (`.obsidian/plugins/` changed)
> - **Restart your AI session** if system instructions changed (`CLAUDE.md`, `GEMINI.md`, or `AGENTS.md`)
