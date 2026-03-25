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

Also extract `folders.logs` from `vault.yml` (default: `07-logs`) and store as `[logs_folder]`. This value is used in Steps 3 and 4 to exclude session log tasks from dashboard queries.

---

## Step 2: Parse keyword argument

Check if any text was passed after `/tasks`:
- `/tasks` → `keyword = none`
- `/tasks <keyword>` → `keyword = everything after "/tasks "` (trim leading/trailing whitespace; preserve internal spaces for multi-word keywords)

After extracting the keyword, strip surrounding quote characters if the entire argument is wrapped in matching `"..."` or `'...'`. Only outermost surrounding quotes are removed — internal spaces and characters are preserved (e.g., `/tasks "client project"` → keyword `client project`).

---

## Step 3: Ensure TASKS.md exists and frontmatter is current

Determine `tasks_path = {vault_root}/TASKS.md`.

**If TASKS.md does not exist:**

Create it with this exact content (replace `YYYY-MM-DD` with today's date):

```markdown
---
tags: [dashboard, tasks]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Task Dashboard

> [!warning] Overdue
> ```tasks
> not done
> due before today
> sort by priority
> sort by due
> ```

> [!info] Due This Week
> ```tasks
> not done
> due after yesterday
> due before in 8 days
> sort by priority
> sort by due
> ```

> [!note] Unscheduled
> ```tasks
> not done
> no due date
> sort by priority
> ```

> [!tip] Due Later
> ```tasks
> not done
> due after in 7 days
> sort by due
> sort by priority
> ```

> [!success] Completed
> _Note: Shows tasks marked complete in Obsidian with a done-date (✅). Tasks completed via terminal do not appear here._
> ```tasks
> done
> sort by done date
> limit 20
> ```
```

If the write fails, stop immediately and tell the user:

> "Could not create TASKS.md at [tasks_path]. Error: [error]. Check that the vault path is correct and that you have write permission. Vault root used: [vault_root]"

Do not proceed to Steps 4, 5, or 6 if the write failed.

**If TASKS.md already exists:**

Read the file. Check the `updated:` value in frontmatter:
- If `updated:` already equals today's date → skip the frontmatter write (no-op)
- If `updated:` key is missing entirely → add `updated: YYYY-MM-DD` before the closing `---`. If this edit fails, stop and report the error to the user. Do not proceed.
- Otherwise → update only the `updated: YYYY-MM-DD` line to today's date using the Edit tool. If the edit fails, stop and report the error to the user. Do not proceed.

---

## Step 4: Handle keyword filter

**If keyword is provided:**

Look for an existing `> [!search]` callout block in TASKS.md (a line starting with `> [!search]`).

- If found: replace the entire block (all consecutive `> ` prefixed lines until the first non-`> ` line or blank line) with the new block below
- If not found: insert immediately before the `# Task Dashboard` heading (between the existing blank line after frontmatter `---` and the heading)

Insert/replace with (substitute actual keyword for `<keyword>`; keyword is quoted to support multi-word searches):

```
> [!search] Filtered: "<keyword>"
> _Matches tasks where description or path contains "<keyword>"_
> ```tasks
> not done
> (description includes "<keyword>") OR (path includes "<keyword>")
> sort by priority
> sort by due
> ```

```

(Note: `[!search]` renders as a generic note style in Obsidian — not a native callout type. Include a blank line after the closing ` ``` ` before the next section.)

If the edit fails, stop and report the error to the user. Do not proceed.

**If no keyword:**

Check if a `> [!search]` block exists in TASKS.md. If it does, remove it entirely — including the blank line that follows it and the blank line that precedes it (to avoid a double blank line between frontmatter `---` and `# Task Dashboard`). If removal fails, report the error and do not proceed.

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
- With keyword: `TASKS.md opened in Obsidian — filtered by "<keyword>".`
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
