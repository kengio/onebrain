---
name: tasks
description: Show a dashboard of all tasks across the vault — overdue, due soon, open, and recently completed
triggers:
  - /ob:tasks
  - ob:tasks
  - ob:show tasks
  - ob:my todos
  - ob:todo list
---

# Task Dashboard

Shows all tasks across the vault, organized by urgency, with quick actions to update them.

---

## Step 1: Scan the Vault

Use the Grep tool to find all task lines across active vault folders.

Search for `- \[.\]` (regex) in these directories only:
- `00-inbox/`
- `01-projects/`
- `02-knowledge/`
- `04-memory-log/`

**Skip entirely:** `03-archive/`, `.obsidian/`, `.claude/`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `README.md`

These excluded files contain template examples or system instructions, not real tasks.

---

## Step 2: Parse Each Task Line

For each matched line, extract:

| Field | How to extract |
|-------|---------------|
| **Status** | `- [ ]` = open, `- [x]` = completed |
| **Description** | Text after the checkbox, minus emoji markers |
| **Due date** | `📅 YYYY-MM-DD` if present |
| **Priority** | `🔺` high, `⏫` medium, `🔽` low (absent = none) |
| **Source** | File path → strip extension and leading path → `[[Note Name]]` |

---

## Step 3: Categorize by Urgency

Today's date is available from the system. Using it:

- **Overdue** — open tasks with due date < today
- **Due Soon** — open tasks with due date within the next 7 days (today through today+7)
- **All Open** — open tasks with no due date, or due date > 7 days out
- **Completed This Week** — completed (`- [x]`) tasks found in files modified in the last 7 days

Within each section, sort by:
1. Priority: 🔺 → ⏫ → 🔽 → none
2. Then by due date (earliest first)

---

## Step 4: Display the Dashboard

Print the dashboard in this format:

```
## 🔴 Overdue (N)
- [ ] Task description 📅 YYYY-MM-DD  🔺  ← [[Source Note]]

## 🟡 Due Soon (N)
- [ ] Task description 📅 YYYY-MM-DD  ← [[Source Note]]

## 📋 All Open (N)
- [ ] Task description  ← [[Source Note]]

## ✅ Completed This Week (N)
- [x] Task description 📅 YYYY-MM-DD  ← [[Source Note]]
```

If a section has no tasks, show:
> None — you're clear!

Show the count `(N)` in every section header, even when zero.

---

## Step 5: Quick Actions

After the dashboard, say:

> **Quick actions:**
> 1. ✅ Mark tasks complete — tell me which ones
> 2. ➕ Add a quick task — I'll ask for details
> 3. 👋 Done — no changes needed

Wait for the user's choice, then follow the matching branch below.

### Branch 1 — Mark Complete

- Ask the user to identify tasks by number (based on dashboard order) or description.
- Read the source file for each identified task.
- Change `- [ ]` to `- [x]` for the matching line(s).
- Confirm: "Marked N task(s) complete in [[Source Note]]."

### Branch 2 — Add a Task

Ask in sequence:
1. **Description** — what's the task?
2. **Due date** — any deadline? (optional, skip if none)
3. **Priority** — high 🔺, medium ⏫, low 🔽, or none?
4. **Where to add it** — suggest existing project notes by name; default to `00-inbox/YYYY-MM-DD-tasks.md` if no preference.

Write the task in Obsidian Tasks format:
```
- [ ] Task description 📅 YYYY-MM-DD  🔺
```

Confirm: "Added to [[Note Name]]."

### Branch 3 — Done

Say:
> All good — your task list is up to date. See you next time!

---

## Step 6: Empty State

If no tasks are found anywhere after scanning:

> No tasks found in your vault yet. Tasks get created when you use `/ob:braindump`, `/ob:weekly`, or add them manually to notes.
>
> Want to add one now?

If yes, proceed with Branch 2 above.
