---
name: tasks
description: Create or update the live task dashboard (TASKS.md) in Obsidian and open it. Optionally filter by keyword.
---

# Task Dashboard

Creates or updates a permanent `TASKS.md` at the vault root using Obsidian Tasks plugin live query blocks, then opens it in Obsidian. The file is always current — no vault scanning needed. Mark tasks complete directly in Obsidian by clicking the checkboxes.

Usage:
- `/tasks` — open the full dashboard
- `/tasks <keyword>` — open with a filtered view (e.g., `/tasks onebrain`, `/tasks client project`)

---

## Step 1: Locate vault root

Read `vault.yml` from the current working directory. The directory containing `vault.yml` is the vault root. If `vault.yml` does not exist, warn the user:

> "vault.yml not found — using current working directory as vault root: [path]. Run `/onboarding` to set up your vault configuration."

Then proceed with cwd as vault root.

Also extract `folders.logs` from `vault.yml` and store as `[logs_folder]`. If the key is absent (or vault.yml was not found), use `07-logs` as the default and proceed without warning. This value is used in Steps 3 and 4 to exclude session log tasks from dashboard queries.

---

## Step 2: Parse keyword argument

Check if any text was passed after `/tasks`:
- `/tasks` → `keyword = none`
- `/tasks <keyword>` → `keyword = everything after "/tasks "` (trim leading/trailing whitespace; preserve internal spaces for multi-word keywords)

If a keyword was extracted, strip surrounding quote characters if the entire argument is wrapped in matching `"..."` or `'...'`. Only outermost surrounding quotes are removed — internal spaces and characters are preserved (e.g., `/tasks "client project"` → keyword `client project`).

---

## Step 3: Ensure TASKS.md exists and frontmatter is current

Determine `tasks_path = {vault_root}/TASKS.md`.

**If TASKS.md does not exist:**

Create it with this exact content (replace `YYYY-MM-DD` with today's date and `[logs_folder]` with the actual logs folder path extracted in Step 1, e.g., `07-logs`):

```markdown
---
tags: [dashboard, tasks]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Task Dashboard

## 🔴 Overdue

```tasks
not done
exclude path includes [logs_folder]
due before today
sort by priority
sort by due
```

## 🗓 Due This Week

```tasks
not done
exclude path includes [logs_folder]
due after yesterday
due before in 8 days
sort by priority
sort by due
```

## 📋 Unscheduled

```tasks
not done
exclude path includes [logs_folder]
no due date
sort by priority
```

## 🔵 Due Later

```tasks
not done
exclude path includes [logs_folder]
due after in 7 days
sort by due
sort by priority
```

## ✅ Completed

_Note: Shows tasks marked complete in Obsidian with a done-date (✅). Tasks completed via terminal do not appear here._

```tasks
done
exclude path includes [logs_folder]
sort by done date
limit 20
```
```

If the write fails, stop immediately and tell the user:

> "Could not create TASKS.md at [tasks_path]. Error: [error]. Check that the vault path is correct and that you have write permission. Vault root used: [vault_root]"

Do not proceed to Steps 4, 5, or 6 if the write failed.

**If TASKS.md already exists:**

Read the file.

Frontmatter: read `created:` from the existing frontmatter and preserve it; update `updated:` to today's date. If `created:` is absent, use today's date and tell the user: "`created:` was missing from TASKS.md frontmatter — set to today's date. Edit it manually if you know the original date."

Body: regenerate all content from the `# Task Dashboard` heading onward using the same five-block template above (substitute `[logs_folder]` with the actual logs folder path extracted in Step 1, e.g., `07-logs`). Leave everything before `# Task Dashboard` — including the frontmatter and any `[!search]` block — intact during this regeneration step. (Step 4 may subsequently modify the `[!search]` block.)

Write the updated file (frontmatter and any content above `# Task Dashboard` preserved, body from `# Task Dashboard` onward regenerated). If the write fails, stop immediately and tell the user:

> "Could not update TASKS.md at [tasks_path]. Error: [error]. Check that the vault path is correct and that you have write permission. Vault root used: [vault_root]"

Do not proceed to Steps 4, 5, or 6 if the write failed.

---

## Step 4: Handle keyword filter

**If keyword is provided:**

Look for an existing `## 🔍 Filtered:` section in TASKS.md (a line starting with `## 🔍 Filtered:`).

- If found: replace from that heading line through the closing ` ``` ` of its tasks block with the new block below
- If not found: insert immediately after the `# Task Dashboard` heading line (followed by a blank line, then the new block)

Insert/replace with (substitute actual keyword for `<keyword>` and actual logs folder path for `[logs_folder]`, e.g., `07-logs`):

```
## 🔍 Filtered: <keyword>

_Matches tasks where description or path contains <keyword>_

```tasks
not done
exclude path includes [logs_folder]
(description includes <keyword>) OR (path includes <keyword>)
sort by priority
sort by due
```

```

(Include a blank line after the closing ` ``` ` before the next section.)

If the edit fails, stop immediately and tell the user:

> "Could not update the keyword filter in TASKS.md at [tasks_path]. Error: [error]. Check write permissions."

Do not proceed.

**If no keyword:**

Check if a `## 🔍 Filtered:` section exists in TASKS.md. If it does, remove it entirely — the heading line, the blank line after it, the subtitle line, the blank line before the tasks block, the tasks block itself, and the blank line that follows — so there is no extra blank line between `# Task Dashboard` and `## 🔴 Overdue`. If removal fails, tell the user:

> "Could not remove the keyword filter from TASKS.md at [tasks_path]. Error: [error]. Check write permissions."

Do not proceed.

---

## Step 5: Open in Obsidian

Build the `obsidian://` URI using path-based addressing:

1. Take the absolute path to `TASKS.md`
2. URL-encode it, keeping `/`, `:`, and `@` as literal characters:
   - Priority order: Python3 first, then Node.js
   - Python3: `urllib.parse.quote(path, safe='/:@')`
   - Node.js: `encodeURIComponent(path).replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/%40/gi, '@')`
   - If neither runtime is available: go to Step 6 encoding-failure branch
3. `uri = "obsidian://open?path=" + encoded_path`

Open via Bash based on platform (detect from `$OSTYPE`). Capture the exit code:
- macOS: `open "<uri>"`
- Linux (non-WSL): `xdg-open "<uri>"`
- Linux (WSL): `cmd.exe /c start "" "<uri>"`
- Windows (msys/cygwin): `cmd.exe /c start "" "<uri>"`

**If exit code 0:** proceed to Step 6 success branch.
**If non-zero exit code:** proceed to Step 6 open-failure branch.

---

## Step 6: Print confirmation

**Success:**
- With keyword: `TASKS.md opened in Obsidian — filtered by <keyword>.`
- Without keyword: `TASKS.md opened in Obsidian.`

**Open-failure (open command returned non-zero, encoding succeeded):**

> "TASKS.md was updated but could not be opened automatically in Obsidian.
>
> Open it manually:
> - In Obsidian: navigate to `TASKS.md` in your vault
> - Via URI: `obsidian://open?path=[encoded_path]`
>
> If Obsidian is not installed, visit https://obsidian.md"

**Encoding-failure (no Python3 or Node.js available):**

> "TASKS.md was updated but could not be opened automatically — URL encoding is unavailable (Python3 and Node.js both missing). Open TASKS.md manually in Obsidian."
