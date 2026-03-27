---
name: moc
description: Create or update the vault portal (MOC.md) at the vault root — a Map of Content with live Dataview queries, AI summary, and user Pinned section. Opens MOC.md in Obsidian.
---

# Vault Portal

Creates or updates `MOC.md` at the vault root — a hybrid Map of Content with:
- **AI zone:** agent-written summary callout (note counts, focus note)
- **Dataview zone:** live queries for Tasks, Recently Modified, Projects, Areas, Knowledge, Resources, Bookmarks
- **Static zone:** user-maintained Pinned section (never overwritten by the agent)

Usage:
- `/moc` — create or refresh MOC.md and open it in Obsidian

---

## Step 1: Read vault configuration

Read `vault.yml` from the current working directory. Extract folder paths with these defaults if keys are absent:

| Key | Default |
|-----|---------|
| `folders.inbox` | `00-inbox` |
| `folders.projects` | `01-projects` |
| `folders.areas` | `02-areas` |
| `folders.knowledge` | `03-knowledge` |
| `folders.resources` | `04-resources` |
| `folders.agent` | `05-agent` |
| `folders.archive` | `06-archive` |
| `folders.logs` | `07-logs` |

If `vault.yml` does not exist, use all defaults and warn the user:
> "vault.yml not found — using default folder paths. Run `/onboarding` to set up your vault configuration."

If `vault.yml` exists but cannot be read or parsed, stop immediately and tell the user:
> "vault.yml exists but could not be parsed — aborting. Check vault.yml for syntax errors and try again. Error: [error]."

Store `moc_path = {vault_root}/MOC.md`.

---

## Step 2: Scan vault for summary data

Collect the following using Glob to count `.md` files:

- **projects_count** — `.md` files under `[folders.projects]/` (recursive)
- **areas_count** — `.md` files under `[folders.areas]/` (recursive)
- **knowledge_count** — `.md` files under `[folders.knowledge]/` (recursive)
- **resources_count** — `.md` files under `[folders.resources]/` (recursive)
- **inbox_count** — `.md` files directly in `[folders.inbox]/` (non-recursive, direct children only)
- **focus_note** — the single most recently modified `.md` file across projects, areas, knowledge, and resources folders. Store its display name (filename without `.md` extension) and its vault-relative path for use as a wikilink.

If a folder does not exist on disk, use count 0 for that folder — this is expected for new vaults.

If the Glob tool returns an error or cannot enumerate a folder that appears to exist, stop immediately and tell the user:
> "Could not scan [folder] — MOC.md was not written. Error: [error]. Resolve the issue and try again."

Do not write MOC.md with potentially incorrect counts.

---

## Step 3: Preserve existing Pinned section

**If `MOC.md` exists:**
- Read the file. If the read fails, stop immediately and tell the user:
  > "Could not read existing MOC.md at [moc_path] — aborting to protect your Pinned section. Error: [error]. Resolve the file access issue and try again."
- Extract `created:` from the frontmatter — store as `created_date` (fall back to today if absent)
- Set `is_new_file = false`
- Find the line that starts with `## 📌 Pinned`
- Store everything from that line to the end of file as `pinned_content`
- If `## 📌 Pinned` is not found in the existing file, warn the user before continuing:
  > "Warning: Pinned section (`## 📌 Pinned`) not found in existing MOC.md — the default placeholder will be used instead. Any content you added below the last recognized section header may not be preserved."
  Then use the default pinned block.

**If `MOC.md` does not exist:**
- Set `created_date` to today
- Set `is_new_file = true`
- Use the default pinned block

---

## Step 4: Write MOC.md

Write the complete file. Replace every placeholder in the template with actual values before writing.

**Placeholder reference:**

| Placeholder | Value |
|------------|-------|
| `CREATED_DATE` | preserved `created:` date or today |
| `TODAY` | today's date (YYYY-MM-DD) |
| `PROJECTS_FOLDER` | `folders.projects` value |
| `AREAS_FOLDER` | `folders.areas` value |
| `KNOWLEDGE_FOLDER` | `folders.knowledge` value |
| `RESOURCES_FOLDER` | `folders.resources` value |
| `AGENT_FOLDER` | `folders.agent` value |
| `LOGS_FOLDER` | `folders.logs` value |
| `ARCHIVE_FOLDER` | `folders.archive` value |
| `PROJECTS_COUNT` | projects_count |
| `AREAS_COUNT` | areas_count |
| `KNOWLEDGE_COUNT` | knowledge_count |
| `RESOURCES_COUNT` | resources_count |
| `INBOX_COUNT` | inbox_count |
| `FOCUS_LINK` | `[[vault-relative-path\|display-name]]` of focus_note — e.g. `[[01-projects/alpha/Project Alpha\|Project Alpha]]`. Use `—` if no notes found. |
| `FIRST_RUN_LINE` | If `is_new_file` is true: `> 💡 Install the [Dataview plugin](https://github.com/blacksmithgu/obsidian-dataview) to activate live query sections.` — otherwise remove this line entirely from the output; do not insert a blank line where it was. |
| `PINNED_CONTENT` | preserved pinned section (or default below) |

**Template:**

`````markdown
---
tags: [dashboard, moc]
created: CREATED_DATE
updated: TODAY
---

# 🧠 Vault Portal

> [!info] Agent Summary — updated TODAY
> **PROJECTS_COUNT** projects · **AREAS_COUNT** areas · **KNOWLEDGE_COUNT** knowledge notes · **RESOURCES_COUNT** resources · **INBOX_COUNT** inbox items
> 🔺 Focus: FOCUS_LINK
FIRST_RUN_LINE

## ⚡ Tasks

```tasks
not done
path does not include LOGS_FOLDER
path does not include ARCHIVE_FOLDER
due before in 8 days
sort by priority
sort by due
```

## 🕐 Recently Modified

```dataview
TABLE file.mtime AS "Modified"
FROM ""
WHERE !startswith(file.folder, "LOGS_FOLDER") AND !startswith(file.folder, "AGENT_FOLDER") AND !startswith(file.folder, "ARCHIVE_FOLDER") AND file.name != "MOC" AND file.name != "TASKS"
SORT file.mtime DESC
LIMIT 10
```

## 🚀 Projects

```dataview
LIST
FROM "PROJECTS_FOLDER"
SORT file.mtime DESC
```

## 🗂 Areas

```dataview
LIST
FROM "AREAS_FOLDER"
SORT file.name ASC
```

## 🧠 Knowledge

```dataview
TABLE length(rows) AS "Notes"
FROM "KNOWLEDGE_FOLDER"
GROUP BY file.folder
SORT key ASC
```

## 📚 Resources

```dataview
LIST
FROM "RESOURCES_FOLDER"
SORT file.mtime DESC
```

## 🔖 Bookmarks

[[Bookmarks]] — saved URLs and references.

PINNED_CONTENT
`````

**Default `PINNED_CONTENT`** (used when no existing Pinned section is found):

```markdown
## 📌 Pinned

<!-- Add your own permanent links and notes here. The agent will never overwrite this section. -->
```

**If the write fails**, stop immediately and tell the user:
> "Could not write MOC.md at [moc_path]. Error: [error]. Vault root used: [vault_root]"

---

## Step 5: Open in Obsidian

Build the `obsidian://` URI using path-based addressing:

1. Take the absolute path to `MOC.md`
2. URL-encode it, keeping `/`, `:`, and `@` as literal characters:
   - Python3 first: `urllib.parse.quote(path, safe='/:@')`
   - Node.js fallback: `encodeURIComponent(path).replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/%40/gi, '@')`
   - If neither available: go to encoding-failure branch
3. Build: `uri = "obsidian://open?path=" + encoded_path`

Open via Bash based on platform (detect from `$OSTYPE`). Capture exit code:
- macOS (`darwin`): `open "<uri>"`
- Linux (non-WSL): `xdg-open "<uri>"`
- Linux (WSL): `cmd.exe /c start "" "<uri>"`
- Windows (msys/cygwin): `cmd.exe /c start "" "<uri>"`
- Unrecognized platform: skip the open attempt and go to the encoding-failure branch, replacing the reason with "platform not recognized".

---

## Step 6: Confirm

**Exit code 0 (success):** `MOC.md opened in Obsidian.`

**Non-zero exit code (open failed):**
> "MOC.md was updated but could not be opened automatically in Obsidian.
>
> Open it manually:
> - In Obsidian: navigate to `MOC.md` in your vault
> - Via URI: `obsidian://open?path=[encoded_path]`
>
> If Obsidian is not installed, visit https://obsidian.md"

**Encoding-failure (no Python3 or Node.js):**
> "MOC.md was updated but could not be opened automatically — URL encoding is unavailable (Python3 and Node.js both missing). Open it manually in Obsidian by navigating to `MOC.md`."
