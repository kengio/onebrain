---
name: daily
description: Two-phase daily briefing and intention-setting — surfaces tasks and session context, then saves today's focus as a daily note
---

# /daily — Daily Briefing & Intention

Surfaces what needs attention today, then saves your stated focus as a daily note in the inbox.

---

## Before You Begin

Read `vault.yml` and extract:
- `folders.logs` as `[logs_folder]` (default: `07-logs`)
- `folders.inbox` as `[inbox_folder]` (default: `00-inbox`)
- `folders.projects` as `[projects_folder]` (default: `01-projects`)

Determine today's date (`YYYY-MM-DD`) and current local time in Asia/Bangkok:
- **Morning mode**: before 10:00
- **Normal mode**: 10:00 and later

---

## Phase 1: Briefing

### Previous Session Recap (Morning Mode Only)

Glob `[logs_folder]/**/*.md`. Find the most recent session log whose `date` frontmatter is before today (not today). On Mondays this will typically be Friday's log. If no prior session exists, skip this section silently.

Read that day's session log(s). Extract main topics and any unchecked action items.

### Briefing Content

Pull from two sources:

**Source 1 — Tasks due today or overdue:**
Grep `[projects_folder]/**/*.md` and `[inbox_folder]/*.md` for task lines matching `- [ ] .*📅 \d{4}-\d{2}-\d{2}`. Filter to dates ≤ today. Group: overdue first, then due today. Include the source note name.

**Source 2 — Open action items from last session:**
If morning mode: already loaded from recap step above — extract unchecked `- [ ]` items from the `## Action Items` section.
If normal mode: Glob `[logs_folder]/**/*.md`. Find the most recent session log whose `date` frontmatter is before today. Read that log and extract unchecked `- [ ]` items from the `## Action Items` section.

### Display the Briefing

```
## Daily Briefing — DD Mon YYYY [morning / afternoon / evening]

**Last session (DD Mon):** [1–2 sentence recap of topics + open items]
(morning mode only — skip if no prior session found)

**Tasks due today:**
- [ ] Task description 📅 YYYY-MM-DD (from [[Note Name]])
- [ ] Overdue task 📅 YYYY-MM-DD (overdue — from [[Note Name]])

**Open from last session:**
- [ ] Action item text
```

If both sources are empty:
> No tasks or open items for today.

Then ask:
> **วันนี้จะ focus อะไรครับ?**

Wait for the user's response before proceeding to Phase 2.

---

## Phase 2: Intention → Daily Note

### Check if today's daily note exists

Check whether `[inbox_folder]/YYYY-MM-DD-daily.md` already exists.

**If it does NOT exist (first run today):**
Create the file with the full template below.

**If it already exists (run more than once today):**
Overwrite the `## Today's Focus` section only — preserve everything else.

### Daily Note Template (new file only)

```markdown
---
tags: [daily]
created: YYYY-MM-DD
---

# Daily — DD Mon YYYY

## Briefing

### Tasks due today
- [ ] Task A 📅 YYYY-MM-DD
- [ ] Task B 📅 YYYY-MM-DD (overdue)

### Open from last session
- [ ] Action item text

## Today's Focus

[User's stated intention]
```

If a section has no content — including when `## Action Items` is absent from the session log or all its items are already checked — write the heading with a single line: `(none)`

### Confirm

- New file created: `Daily note saved → [inbox_folder]/YYYY-MM-DD-daily.md`
- Existing file updated: `Daily note updated → [inbox_folder]/YYYY-MM-DD-daily.md`
