---
name: tasks
description: Create or update the live task dashboard (TASKS.md) in Obsidian.
---

# Task Dashboard

Creates or updates a permanent `TASKS.md` at the vault root using Obsidian Tasks plugin live query blocks. The file is always current — no vault scanning needed. Mark tasks complete directly in Obsidian by clicking the checkboxes.

Usage:
- `/tasks` — open the full dashboard

---

## Step 1: Locate vault root

Read `vault.yml` from the current working directory. The directory containing `vault.yml` is the vault root. If `vault.yml` does not exist, warn the user:

> "vault.yml not found — using current working directory as vault root: [path]. Run `/onboarding` to set up your vault configuration."

Then proceed with cwd as vault root.

Extract the following folder paths from `vault.yml`, storing each as a variable for use in Step 2. If a key is absent, use the default shown:

| vault.yml key | Variable | Default |
|---|---|---|
| `folders.logs` | `[logs_folder]` | `07-logs` |
| `folders.archive` | `[archive_folder]` | `06-archive` |
| `folders.knowledge` | `[knowledge_folder]` | `03-knowledge` |
| `folders.resources` | `[resources_folder]` | `04-resources` |
| `folders.agent` | `[agent_folder]` | `05-agent` |

`.claude` is always excluded as a hardcoded literal (not in vault.yml) — it is the plugin host directory and is not user-configurable.

---

## Step 2: Ensure TASKS.md exists and frontmatter is current

Determine `tasks_path = {vault_root}/TASKS.md`.

**If TASKS.md does not exist:**

Create it with this exact content (replace `YYYY-MM-DD` with today's date and substitute all five bracket-notation variables — `[logs_folder]`, `[archive_folder]`, `[knowledge_folder]`, `[resources_folder]`, `[agent_folder]` — with actual values extracted in Step 1; `.claude` is a hardcoded literal and requires no substitution):

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
path does not include [knowledge_folder]
path does not include [resources_folder]
path does not include [agent_folder]
path does not include .claude
due before today
sort by priority
sort by due
```

## 🗓 Due This Week

```tasks
not done
path does not include [logs_folder]
path does not include [archive_folder]
path does not include [knowledge_folder]
path does not include [resources_folder]
path does not include [agent_folder]
path does not include .claude
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
path does not include [knowledge_folder]
path does not include [resources_folder]
path does not include [agent_folder]
path does not include .claude
no due date
sort by priority
```

## 🔵 Due Later

```tasks
not done
path does not include [logs_folder]
path does not include [archive_folder]
path does not include [knowledge_folder]
path does not include [resources_folder]
path does not include [agent_folder]
path does not include .claude
due after in 7 days
sort by due
sort by priority
```

## ✅ Completed

```tasks
done
path does not include [logs_folder]
path does not include [archive_folder]
path does not include [knowledge_folder]
path does not include [resources_folder]
path does not include [agent_folder]
path does not include .claude
sort by done date
limit 20
```
`````

If the write fails, stop immediately and tell the user:

> "Could not create TASKS.md at [tasks_path]. Error: [error]. Check that the vault path is correct and that you have write permission. Vault root used: [vault_root]"

Do not proceed to Step 3 if the write failed.

**If TASKS.md already exists:**

Read the file. Extract `created:` from the frontmatter — if absent, use today's date and tell the user: "`created:` was missing from TASKS.md frontmatter — set to today's date. Edit it manually if you know the original date."

Overwrite the entire file using the same template as above, substituting:
- `created:` with the extracted (or today's) date
- `updated:` with today's date
- All five bracket-notation variables from the Step 1 table (`[logs_folder]`, `[archive_folder]`, `[knowledge_folder]`, `[resources_folder]`, `[agent_folder]`) with actual values extracted from `vault.yml`

If the write fails, stop immediately and tell the user:

> "Could not update TASKS.md at [tasks_path]. Error: [error]. Check that the vault path is correct and that you have write permission. Vault root used: [vault_root]"

Do not proceed to Step 3 if the write failed.

---

## Step 3: Print confirmation

`TASKS.md updated.`
