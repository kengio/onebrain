---
name: tasks
description: Create or update the live task dashboard (TASKS.md) in Obsidian and open it.
---

# Task Dashboard

Creates or updates a permanent `TASKS.md` at the vault root using Obsidian Tasks plugin live query blocks, then opens it in Obsidian. The file is always current — no vault scanning needed. Mark tasks complete directly in Obsidian by clicking the checkboxes.

Usage:
- `/tasks` — open the full dashboard

---

## Step 1: Locate vault root

Read `vault.yml` from the current working directory. The directory containing `vault.yml` is the vault root. If `vault.yml` does not exist, warn the user:

> "vault.yml not found — using current working directory as vault root: [path]. Run `/onboarding` to set up your vault configuration."

Then proceed with cwd as vault root.

Also extract `folders.logs` from `vault.yml` and store as `[logs_folder]`. If the key is absent (or vault.yml was not found), use `07-logs` as the default and proceed without warning. This value is used in Step 2 to exclude session log tasks from dashboard queries.

Also extract `folders.archive` from `vault.yml` and store as `[archive_folder]`. If the key is absent, use `06-archive` as the default and proceed without warning. This value is used in Step 2 to exclude archived notes from dashboard queries.

---

## Step 2: Ensure TASKS.md exists and frontmatter is current

Determine `tasks_path = {vault_root}/TASKS.md`.

**If TASKS.md does not exist:**

Create it with this exact content (replace `YYYY-MM-DD` with today's date, `[logs_folder]` with the actual logs folder path extracted in Step 1, e.g., `07-logs`, and `[archive_folder]` with the actual archive folder path extracted in Step 1, e.g., `06-archive`):

`````markdown
---
tags: [dashboard, tasks]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Task Dashboard

## 🔴 Overdue

```tasks
not done
path does not include [logs_folder]
path does not include [archive_folder]
due before today
sort by priority
sort by due
```

## 🗓 Due This Week

```tasks
not done
path does not include [logs_folder]
path does not include [archive_folder]
due after yesterday
due before in 8 days
sort by priority
sort by due
```

## 📋 Unscheduled

```tasks
not done
path does not include [logs_folder]
path does not include [archive_folder]
no due date
sort by priority
```

## 🔵 Due Later

```tasks
not done
path does not include [logs_folder]
path does not include [archive_folder]
due after in 7 days
sort by due
sort by priority
```

## ✅ Completed

```tasks
done
path does not include [logs_folder]
path does not include [archive_folder]
sort by done date
limit 20
```
`````

If the write fails, stop immediately and tell the user:

> "Could not create TASKS.md at [tasks_path]. Error: [error]. Check that the vault path is correct and that you have write permission. Vault root used: [vault_root]"

Do not proceed to Steps 3 or 4 if the write failed.

**If TASKS.md already exists:**

Read the file. Extract `created:` from the frontmatter — if absent, use today's date and tell the user: "`created:` was missing from TASKS.md frontmatter — set to today's date. Edit it manually if you know the original date."

Overwrite the entire file using the same template as above, substituting:
- `created:` with the extracted (or today's) date
- `updated:` with today's date
- `[logs_folder]` with the actual logs folder path extracted in Step 1
- `[archive_folder]` with the actual archive folder path extracted in Step 1

If the write fails, stop immediately and tell the user:

> "Could not update TASKS.md at [tasks_path]. Error: [error]. Check that the vault path is correct and that you have write permission. Vault root used: [vault_root]"

Do not proceed to Steps 3 or 4 if the write failed.

---

## Step 3: Print confirmation

`TASKS.md updated.`
