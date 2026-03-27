---
name: update
description: Update OneBrain skills, config, and plugins from GitHub — never touches your notes or data
---

## Install Path Detection

Before doing anything else, check whether OneBrain is installed at the project level or globally:

Check if `.claude/plugins/onebrain/` exists in the current vault directory.

**If it does NOT exist** (global plugin install — /onboarding has not been run yet):

Stop and tell the user:
> OneBrain is installed as a global plugin but hasn't been adopted into this vault yet.
>
> Run `/onboarding` first to bundle OneBrain into your vault — after that, `/update` will work normally.

Do not proceed further.

**If it DOES exist** (vault install — Path A or adopted Path B): continue with the steps below.

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

> **Note:** `CLAUDE.md`, `GEMINI.md`, and `AGENTS.md` are not in the fetch allowlist. Instead, Step 4e ensures they contain the `@import` pointer to `INSTRUCTIONS.md` (migrating old inline instructions if needed).

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
| `.gitignore` | file |
| `.claude/plugins/onebrain/` | directory |
| `.claude-plugin/` | directory |

**For individual files:** Fetch the upstream content using WebFetch:
`https://raw.githubusercontent.com/kengio/onebrain/main/[path]`
Read the local file with the Read tool and compare. Mark as `unchanged`, `modified`, or `new` (if the local file doesn't exist yet). If the fetch fails, mark as `fetch-failed` — do NOT treat as unchanged.

**For directories:** Filter the upstream file tree (from Step 2) to all blobs whose path starts with the directory prefix. For each upstream file:
- Fetch its content from `https://raw.githubusercontent.com/kengio/onebrain/main/[path]`
- Read the local file with the Read tool and compare
- Mark as `unchanged`, `modified`, `new`, or `fetch-failed` (if the fetch fails)

Also identify **local files that no longer exist upstream** (present locally but absent from the upstream tree for that directory prefix). These will be deleted in Step 4 to keep the directory in sync.

If any files are `fetch-failed`, include them in the summary and do not proceed to Step 4. Tell the user:
> Could not fetch N file(s) from GitHub. This may be a transient network issue. Re-run `/update` to retry.

Present the summary before asking to apply. Example:
> Found: 2 modified, 1 new, 7 unchanged.
> Modified: `.claude/plugins/onebrain/`
> New: `.claude/plugins/onebrain/skills/new-skill/SKILL.md`
>
> Apply these updates?

Wait for confirmation.

---

## Step 3b: Clear Plugin Cache (If Version Unchanged)

Before applying updates, check whether the upstream plugin version matches the local plugin version:

1. Read `[vault root]/.claude/plugins/onebrain/.claude-plugin/plugin.json` and note `version` as **local_version**.
2. The upstream `plugin.json` was already fetched in Step 3 — note its `version` as **upstream_version**.

**If upstream_version == local_version (no version bump):**

The plugin cache directory for this version must be removed so the plugin manager picks up the updated source files on next load. Run:

Run the following, skipping silently any path that does not exist (this is expected when only one cache variant was used):

```bash
rm -rf ~/.claude/plugins/cache/onebrain/onebrain/[local_version]
rm -rf ~/.claude/plugins/cache/onebrain-local/onebrain/[local_version]
```

Only report an error if a path exists but deletion fails. If deletion fails, tell the user: "Could not clear plugin cache at [path]. You can delete it manually, or start a new session — the plugin manager should detect the updated source files automatically." Continue with the update regardless.

On success, report: "Cleared plugin cache for v[local_version] — run /reload-plugins or start a new session to apply changes."

**If upstream_version != local_version:**
No cache action needed — the plugin manager will create a new cache directory for the new version automatically.

---

## Step 4: Apply Updates

After user confirms, apply each changed or new item from the allowlist using the Write tool:

**For individual files:** Write the upstream content (fetched in Step 3) to the local path. If the write fails, record it as `write-failed` and continue to the next file — do not stop.

**For directories:**
- Write each upstream file that is `modified` or `new` to its local path. If any write fails, record it as `write-failed` and continue.
- Delete any local files identified as no longer existing upstream (removed from the repo). If a delete fails, record it as `delete-failed` and continue. This keeps plugin and skill directories clean when files are renamed or removed.

Only modify files that are in the allowlist. Never touch note folders, `[agent_folder]/MEMORY.md`, `vault.yml`, or any user preference files.

After all writes and deletes are attempted: if any `write-failed` or `delete-failed` files exist, include them in the Step 5 report with instructions to manually replace or remove them, and advise re-running `/update`.

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
- **If the copy fails:** report the error and stop. Do not offer to delete the root copy — it is the only remaining copy. Tell the user: "Could not copy MEMORY.md to `[agent_folder]/MEMORY.md`. Ensure `[agent_folder]/` is writable, then re-run `/update`."
- **If the copy succeeds:** verify `[agent_folder]/MEMORY.md` now exists and is non-empty, then ask the user: "Copied MEMORY.md to `[agent_folder]/MEMORY.md` (new location in this version). Can I delete the root copy?"
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

> **Note:** `qmd_collection` is a user-specific key set by `/qmd setup`. It is never included in the migration table above and must never be added or removed by `/update`. If `qmd_collection` is already present in vault.yml, leave it unchanged. If it is absent, leave it absent — the user may not have set up qmd.

For each key:
1. **Check if vault.yml exists.** If it does not exist: skip this key entirely (the user needs to run `/onboarding` first — do not create or modify vault.yml here).
2. **Read vault.yml.** If it cannot be read or parsed: report the error, skip this key, continue.
3. **Check if `folders:` block is present** in the parsed content. If the `folders:` block is absent: report "vault.yml exists but has no `folders:` block — cannot safely add `[key]`. Please check vault.yml manually." Skip this key.
4. **Search for the key** (grep for `[key]:` within the `folders:` block). If it is already present: skip silently.
5. **Insert the key** as a new line within the `folders:` mapping — after the last existing folder entry, inside the `folders:` block. If `folders:` is present but has no entries (the value is null or the block is empty), insert the key as the first and only entry under `folders:`. Do NOT append to the end of the file. Use the Write tool to write the entire updated vault.yml content (read → modify in memory → write back), never a partial append.
6. Report: "Added `[key]` to vault.yml."

---

## Step 4d: Migrate Plugin Key (onebrain-local → onebrain)

The OneBrain marketplace was renamed from `onebrain-local` to `onebrain` in v1.3.0. Existing installations may still have stale keys in their Claude Code settings. This step migrates both affected keys.

Check the following settings files:
- `.claude/settings.json` (project-level)
- `.claude/settings.local.json` (project-level local)

For each file that exists:
1. Read the file. **If read fails:** Report the error and tell the user to manually rename the keys in `[file]`. Continue to the next file.
2. Parse as JSON. **If the file is not valid JSON:** Report the parse error and skip this file. Continue to the next file.
3. Check for either stale key.
4. **If neither found:** Skip silently.
5. **If either found:** Apply both changes to the parsed JSON structure (read → modify → write back):

**Change 1 — `enabledPlugins`:**
- If `"onebrain@onebrain-local"` exists as a key and `"onebrain@onebrain"` does NOT exist: rename the key.
- If both keys exist: remove `"onebrain@onebrain-local"` (keep the new key, avoid duplicates).
- If only `"onebrain@onebrain"` exists: skip (already migrated).

**Change 2 — `extraKnownMarketplaces`:**
- If `"onebrain-local"` exists as a key and `"onebrain"` does NOT exist: rename the key.
- If both keys exist: remove `"onebrain-local"` (keep the new key, avoid duplicates).
- If only `"onebrain"` exists: skip (already migrated).

6. Write the full modified file back. **If write fails:** Report the error and tell the user to manually rename the keys in `[file]`. Continue to the next file.
7. **On success:** Report: "Migrated stale marketplace keys in `[file]`."

---

## Step 4e: Migrate Instruction Files to @import (If Needed)

Old installations may have `CLAUDE.md`, `GEMINI.md`, and/or `AGENTS.md` with ~160 lines of inline OneBrain instructions instead of the single `@import` pointer. This step ensures all three files use the `@import` pattern so the agent always reads the current `INSTRUCTIONS.md`.

**The @import line:** `@.claude/plugins/onebrain/INSTRUCTIONS.md`

**Detection — "already has the @import line":** any non-blank line in the file equals `@.claude/plugins/onebrain/INSTRUCTIONS.md` after stripping leading/trailing whitespace.

**Detection — "old inline instructions":** the file contains a line that starts with `# OneBrain` (the first heading of all old inline instruction blocks).

---

### CLAUDE.md

Read `CLAUDE.md` at the vault root.
- **If read fails:** report the error and tell the user to manually inspect `CLAUDE.md` and ensure it contains the single line `@.claude/plugins/onebrain/INSTRUCTIONS.md` — until resolved, the agent will continue using whatever is currently in that file. Continue to GEMINI.md.

Apply the matching case:

**Case 1 — File does not exist:**
Create `CLAUDE.md` with content: `@.claude/plugins/onebrain/INSTRUCTIONS.md`
- If write fails: report the error and tell the user to create `CLAUDE.md` manually with the single line `@.claude/plugins/onebrain/INSTRUCTIONS.md`. Continue to GEMINI.md.
- On success: report "Created `CLAUDE.md` with @import pointer." Continue to GEMINI.md.

**Case 2 — File exists and already has the @import line:**
Skip silently. Continue to GEMINI.md.

**Case 3 — File exists, no @import line, contains old OneBrain instructions (`# OneBrain` heading present):**
1. Find the line index of the first line starting with `# OneBrain`.
2. Extract **user content**: everything before that line (may be empty).
3. Build new file content:
   - If user content is non-empty (non-blank lines exist before `# OneBrain`): keep that content, then append a blank line followed by `@.claude/plugins/onebrain/INSTRUCTIONS.md`
   - If no user content exists (the file starts with `# OneBrain`): replace the entire file with just `@.claude/plugins/onebrain/INSTRUCTIONS.md`
4. Write back (read-modify-write).
   - If write fails: report the error and tell the user to manually replace the OneBrain block in `CLAUDE.md` with the single line `@.claude/plugins/onebrain/INSTRUCTIONS.md`. Continue to GEMINI.md.
5. On success: report "Migrated `CLAUDE.md` — replaced inline OneBrain instructions with @import pointer." If user content was preserved, add: "Your custom content above the OneBrain block was preserved." Continue to GEMINI.md.

**Case 4 — File exists, no @import line, no `# OneBrain` heading (unrecognized content):**
Do not replace. Append the @import line after a blank line at the end of the file.
- If write fails: report the error and tell the user to manually add `@.claude/plugins/onebrain/INSTRUCTIONS.md` as a new line at the end of `CLAUDE.md`. Continue to GEMINI.md.
- On success: report "Appended @import pointer to `CLAUDE.md` — existing content preserved." Continue to GEMINI.md.

---

### GEMINI.md and AGENTS.md

For each of `GEMINI.md` and `AGENTS.md`:

Read the file.
- **If read fails:** report the error and tell the user to manually inspect `[filename]` and ensure it contains the single line `@.claude/plugins/onebrain/INSTRUCTIONS.md`. Continue to the next file.

Apply the matching case:

**Case 1 — File does not exist:**
Create the file with content: `@.claude/plugins/onebrain/INSTRUCTIONS.md`
- If write fails: report the error and tell the user to create `[filename]` manually with the single line `@.claude/plugins/onebrain/INSTRUCTIONS.md`. Continue to the next file.
- On success: report "Created `[filename]` with @import pointer."

**Case 2 — File exists and already has the @import line:**
Skip silently.

**Case 3 — File exists, no @import line:**
Replace the entire file content with: `@.claude/plugins/onebrain/INSTRUCTIONS.md`
(These files were never intended for user content — no preservation needed.)
- If write fails: report the error and tell the user to manually replace the contents of `[filename]` with the single line `@.claude/plugins/onebrain/INSTRUCTIONS.md`. Continue to the next file.
- On success: report "Migrated `[filename]` — replaced with @import pointer."

---

## Step 5: Report

Show a final summary of what was updated. Then suggest:

> **Done.** OneBrain has been updated.
>
> Next steps:
> - Run `/reload-plugins` to apply changes immediately in this session (no restart needed)
> - Or start a new Claude Code session — changes are picked up automatically
