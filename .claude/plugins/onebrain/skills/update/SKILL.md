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
- `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `.gitignore`
- `.claude/plugins/onebrain/` — all skills, hooks, and agents

**WILL NOT touch (your data and preferences):**
- All your note folders (00-inbox, 01-projects, 02-areas, 03-knowledge, 04-resources, 05-agent, 06-archive, 07-logs) — all your notes
- `[agent_folder]/MEMORY.md` — your identity and session context (inside your agent folder)
- `vault.yml` — your vault configuration
- `.obsidian/` — all Obsidian settings and plugins are yours to manage after onboarding
- `.claude/settings.local.json` — your local Claude settings
- `.claude/onebrain.local.md` — your local plugin config
- `install.sh`, `install.ps1` — only used for fresh installs
- `README.md`, `CONTRIBUTING.md`, `LICENSE`, `assets/` — repo-only files, not part of the vault

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
| `.gitignore` | file |
| `.claude/plugins/onebrain/` | directory |

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
> New: `.claude/plugins/onebrain/skills/new-skill/SKILL.md`
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

Only modify files that are in the allowlist. Never touch note folders, `[agent_folder]/MEMORY.md`, `vault.yml`, or any user preference files.

---

## Step 4b: Migrate MEMORY.md (If Needed)

After applying updates, check for the old MEMORY.md location:

1. Read `vault.yml` to determine `agent_folder` (default: `05-agent`)
2. Check if `MEMORY.md` exists at the vault root
3. Check if `[agent_folder]/MEMORY.md` exists

**Case A — Root MEMORY.md exists, agent folder MEMORY.md does not:**
Copy the file and ask before deleting:
- If `[agent_folder]/` does not exist, create the folder along with `context/` and `memory/` subfolders (each with a `.gitkeep`)
- Copy the content of `MEMORY.md` to `[agent_folder]/MEMORY.md`
- Ask the user: "Copied MEMORY.md to `[agent_folder]/MEMORY.md` (new location in this version). Can I delete the root copy?"
- Delete the root `MEMORY.md` only after confirmation

**Case B — Both exist:**
Do not move. Tell the user:
> Found `MEMORY.md` at the vault root AND at `[agent_folder]/MEMORY.md`. The agent will use `[agent_folder]/MEMORY.md`. Please review and delete the root copy manually when you're ready: `MEMORY.md`.

**Case C — Only agent folder MEMORY.md exists (already migrated):**
No action needed.

**Case D — Neither exists:**
No action needed. User will need to run `/onboarding`.

After running whichever case above applies, proceed to Step 4b-ii.

---

## Step 4b-ii: Patch MEMORY.md Frontmatter (If Needed)

After the location migration above, ensure `[agent_folder]/MEMORY.md` has correct frontmatter.

**Required frontmatter fields** (as defined by the onboarding skill):
```yaml
---
tags: [agent-memory]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

**Procedure:**

1. If `[agent_folder]/MEMORY.md` does not exist (Case D above): skip this step entirely.
2. Read `[agent_folder]/MEMORY.md`.
3. Check whether the file begins with a frontmatter block (first line is exactly `---`).

**If frontmatter is malformed** (file begins with `---` but no second `---` line exists before end of file):
- Do NOT write anything. Report: "MEMORY.md has a malformed frontmatter block (opening `---` with no closing `---`). Skipping frontmatter patch — please fix it manually before re-running `/update`."
- Skip to Step 4c.

**If frontmatter is entirely missing:**
- Prepend the following block before the existing file content (read-modify-write — the new content is the frontmatter block + a blank line + the entire original file content unchanged, do not truncate anything):
  ```yaml
  ---
  tags: [agent-memory]
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  ---
  ```
  Use today's date for both `created` and `updated`.
- If the write fails: report the error and the exact change attempted (so the user can apply it manually). Do not retry.
- Report: "Added missing frontmatter to `[agent_folder]/MEMORY.md`."

**If frontmatter is present but incomplete** (the `---` block exists, but one or more required keys are missing):
- Parse the existing frontmatter block (content between the first and second `---`).
- For each missing key, insert it into the frontmatter block:
  - `tags` missing → add `tags: [agent-memory]`
  - `created` missing → add `created: YYYY-MM-DD` (today's date)
  - `updated` missing → add `updated: YYYY-MM-DD` (today's date)
- Write back the full file: the patched frontmatter followed by the entire original body content unchanged (read-modify-write — do not truncate any part of the body).
- If the write fails: report the error and the exact keys that needed to be added. Do not retry.
- Report: "Patched frontmatter in `[agent_folder]/MEMORY.md` — added: [list of added keys]."

**If frontmatter is present and complete:** Skip silently.

---

## Step 4c: Create Missing Vault Folders (Migration)

After applying updates, ensure any folders introduced in newer versions exist. Check and create if missing — do not report unchanged folders, only new ones.

**Folders to ensure exist:**

| Folder | Purpose | Introduced |
|--------|---------|-----------|
| `[inbox]/imports/` | Staging area for `/import` skill | v1.2.0 |
| `[attachments]/` | Copied attachments root (`--attach` flag) | v1.2.0 |
| `[attachments]/pdf/` | PDF attachments subfolder | v1.2.0 |
| `[attachments]/images/` | Image attachments subfolder | v1.2.0 |
| `[attachments]/video/` | Video attachments subfolder | v1.2.0 |

Where `[attachments]` is resolved from `vault.yml` `folders.attachments` (default: `attachments`).

Where `[inbox]` is resolved from `vault.yml` `folders.inbox` (default: `00-inbox`).

**For each folder in the table:**
1. Check if it exists (glob or ls). If it exists: skip silently.
2. If it does not exist: write an empty `.gitkeep` file inside it (this creates the folder).
   - If the write fails: report the error and tell the user to create the folder manually before using `/import`. Continue to the next folder — do not stop.
3. Report: "Created `[folder]/` — new in this version."

**vault.yml key migration — explicit procedure:**

Run this procedure for each vault.yml key in the table below:

| Key | Value | Introduced |
|-----|-------|-----------|
| `import_inbox` | `[inbox]/imports` | v1.2.0 |
| `attachments` | `attachments` | v1.2.0 |

For each key:
1. **Check if vault.yml exists.** If it does not exist: skip this key entirely (the user needs to run `/onboarding` first — do not create or modify vault.yml here).
2. **Read vault.yml.** If it cannot be read or parsed: report the error, skip this key, continue.
3. **Check if `folders:` block is present** in the parsed content. If the `folders:` block is absent: report "vault.yml exists but has no `folders:` block — cannot safely add `[key]`. Please check vault.yml manually." Skip this key.
4. **Search for the key** (grep for `[key]:` within the `folders:` block). If it is already present: skip silently.
5. **Insert the key** as a new line within the `folders:` mapping — after the last existing folder entry, inside the `folders:` block. If `folders:` is present but has no entries (the value is null or the block is empty), insert the key as the first and only entry under `folders:`. Do NOT append to the end of the file. Use the Write tool to write the entire updated vault.yml content (read → modify in memory → write back), never a partial append.
6. Report: "Added `[key]` to vault.yml."

---

## Step 5: Report

Show a final summary of what was updated. Then suggest:

> **Done.** OneBrain has been updated.
>
> Next steps:
> - **Restart your AI session** if system instructions changed (`CLAUDE.md`, `GEMINI.md`, or `AGENTS.md`)
