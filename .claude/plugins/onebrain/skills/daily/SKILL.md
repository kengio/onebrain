---
name: daily
description: Daily briefing: surfaces tasks due today and open items from the last session
---

# /daily : Daily Briefing

Surfaces tasks due today and open items from the last session.

---

## Before You Begin

Read `vault.yml` and extract:
- `folders.logs` as `[logs_folder]` (default: `07-logs`)
- `folders.inbox` as `[inbox_folder]` (default: `00-inbox`)
- `folders.projects` as `[projects_folder]` (default: `01-projects`)

Count inbox items: Glob `[inbox_folder]/*.md` and store the count as `[inbox_count]`.

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

**Source 1 : Tasks due today or overdue:**
Grep `[projects_folder]/**/*.md` and `[inbox_folder]/*.md` for task lines matching `- [ ] .*📅 \d{4}-\d{2}-\d{2}`. Filter to dates ≤ today. Group: overdue first, then due today. Include the source note name.

**Source 2 : Open action items from last session:**
If morning mode: already loaded from recap step above; extract unchecked `- [ ]` items from the `## Action Items` section.
If normal mode: Glob `[logs_folder]/**/*.md`. Find the most recent session log whose `date` frontmatter is before today. Read that log and extract unchecked `- [ ]` items from the `## Action Items` section.

### Display the Briefing

```
## Daily Briefing · Ddd DD Mon YYYY [morning / afternoon / evening] · inbox N

**Last session (DD Mon):** [1–2 sentence recap of topics + open items]
(morning mode only — skip if no prior session found)

**Tasks due today:**
- [ ] Task description 📅 YYYY-MM-DD (from "Note Name")
- [ ] Overdue task 📅 YYYY-MM-DD (overdue - from "Note Name")

**Open from last session:**
- [ ] Action item text
```

- `Ddd` is the abbreviated day of week (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
- Omit `· inbox N` if inbox count is 0

If both task sources are empty:
> No tasks or open items for today.
