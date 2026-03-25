---
name: tasks
description: Open the live task dashboard in Obsidian (creates TASKS.md if needed). Optionally filter by keyword.
---

# Task Dashboard

Opens a live task dashboard (`TASKS.md`) in Obsidian. The file uses Obsidian Tasks plugin query blocks — always current, no vault scanning needed.

Usage:
- `/tasks` — open the full dashboard
- `/tasks <keyword>` — open with a filtered view (e.g., `/tasks onebrain`, `/tasks client project`)

---

## Step 1: Read vault.yml

Read `vault.yml` from the vault root to confirm the vault root path. If vault.yml does not exist, use the current working directory as the vault root.

---

## Step 2: Parse keyword argument

Check if any text was passed after `/tasks`:
- `/tasks` → `keyword = none`
- `/tasks <keyword>` → `keyword = everything after "/tasks "` (preserve spaces, do not trim)

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

> [!note] All Open
> ```tasks
> not done
> ((no due date) OR (due after in 7 days))
> sort by priority
> sort by due
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

**If TASKS.md already exists:**

Read the file. Check the `updated:` value in frontmatter:
- If `updated:` already equals today's date → skip the frontmatter write (no-op)
- Otherwise → update only the `updated: YYYY-MM-DD` line to today's date using the Edit tool

---

## Step 4: Handle keyword filter

**If keyword is provided:**

Look for an existing `> [!search]` callout block in TASKS.md (it starts with `> [!search]` on a line).

- If found: replace the entire `> [!search]` block (all consecutive `> ` lines that follow it) with the new block below
- If not found: insert the block immediately after the closing `---` of the frontmatter and before the `# Task Dashboard` heading

Insert/replace with:

```
> [!search] Filtered: "<keyword>"
> _Matches tasks where description or path contains "<keyword>"_
> ```tasks
> not done
> (description includes <keyword>) OR (path includes <keyword>)
> sort by priority
> sort by due
> ```

```

(Replace `<keyword>` with the actual keyword text. Include a blank line after the closing ` ``` ` before the next section.)

**If no keyword:**

Check if a `> [!search]` callout block exists in TASKS.md. If it does, remove it entirely (including the blank line that follows it).

---

## Step 5: Open in Obsidian

Build the `obsidian://` URI using path-based addressing:

1. Take the absolute path to `TASKS.md`
2. URL-encode it, keeping `/` and `:` as literal characters (do not percent-encode them):
   - Node.js: `encodeURIComponent(path).replace(/%2F/gi, '/').replace(/%3A/gi, ':')`
   - Python3: `urllib.parse.quote(path, safe='/:@')`
3. URI = `obsidian://open?path=` + encoded path

Open via Bash based on platform (detect from `$OSTYPE`):
- macOS: `open "obsidian://open?path={encoded}" 2>/dev/null || true`
- Linux (non-WSL): `xdg-open "obsidian://open?path={encoded}" &>/dev/null & true`
- Linux (WSL): `cmd.exe /c start "" "obsidian://open?path={encoded}" 2>/dev/null || true`
- Windows (msys/cygwin): `cmd.exe /c start "" "obsidian://open?path={encoded}" 2>/dev/null || true`

If the open command fails (Obsidian not installed, URI rejected, etc.), fail silently — never surface an error to the user.

---

## Step 6: Print confirmation

- With keyword: `TASKS.md opened in Obsidian — filtered by "<keyword>".`
- Without keyword: `TASKS.md opened in Obsidian.`
