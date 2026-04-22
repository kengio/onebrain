---
name: daily
description: "Daily briefing: surfaces tasks due today and open items from the last session. Use when the user wants a snapshot of today's obligations — 'what's on today', 'daily briefing', 'what do I have today'. Do NOT use for: full weekly review (use weekly), vault health check (use doctor), or listing all tasks across future dates."
---

# /daily : Daily Briefing

Surfaces tasks due today and open items from the last session.

---

## Before You Begin

Count inbox items: Glob `[inbox_folder]/*.md` and store the count as `[inbox_count]`.

Determine today's date (`YYYY-MM-DD`) and current local time (local machine time):
- **Morning mode**: before 10:00
- **Normal mode**: 10:00 and later

---

## Phase 1: Briefing

### Previous Session Recap (Morning Mode Only)

Glob `[logs_folder]/**/*.md`. Find the most recent session log (today or earlier). On Mondays this will typically be Friday's log unless there is already a session today. If no prior session exists, skip this section silently.

Read that session log. Extract main topics and any unchecked action items.

### Briefing Content

Pull from two sources:

**Source 1 : Tasks due today or overdue:**
Grep `[projects_folder]/**/*.md` and `[inbox_folder]/*.md` for task lines matching `- [ ] .*📅 \d{4}-\d{2}-\d{2}`. Filter to dates ≤ today. Group: overdue first, then due today. Include the source note name.

**Source 2 : Open action items from last session:**
If morning mode: already loaded from recap step above; extract unchecked `- [ ]` items from the `## Action Items` section.
If normal mode: Glob `[logs_folder]/**/*.md`. Find the most recent session log (today or earlier). Read that log and extract unchecked `- [ ]` items from the `## Action Items` section.

### Display the Briefing

```
──────────────────────────────────────────────────────────────
📅 Daily Briefing · Ddd DD Mon YYYY {period} · inbox N
──────────────────────────────────────────────────────────────
Last session (Ddd DD Mon): [1–2 sentence recap of topics + open items]
(morning mode only — skip if no prior session found)

Tasks due today:
  ⬜ Task description 📅 YYYY-MM-DD (from "Note Name")
  ⬜ Overdue task 📅 YYYY-MM-DD (overdue - from "Note Name")
  (+N more — /daily for full list)

Open from last session:
  ⬜ Action item text
```

Rules:
- `{period}` = morning / afternoon / evening
- Omit `· inbox N` if inbox count is 0
- Omit `(+N more)` line if 5 or fewer tasks
- Omit "Last session" block if not morning mode or no prior session exists

If both task sources are empty:
```
──────────────────────────────────────────────────────────────
📅 Daily Briefing · Ddd DD Mon YYYY {period}
──────────────────────────────────────────────────────────────
✅ Nothing on your plate today — clear!
```

## Known Gotchas

- **Monday morning: "last session" is typically Friday.** When globbing for the most recent session log on a Monday morning, don't assume it's from today or yesterday — it may be 2-3 days ago. Always sort by filename (which contains the date) rather than file modification time.

- **Tasks grep includes tasks in TASKS.md.** `TASKS.md` contains Dataview query blocks, not real tasks — its content changes dynamically and may include false matches. Exclude `TASKS.md` from the task grep.
