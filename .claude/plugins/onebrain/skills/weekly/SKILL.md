---
name: weekly
description: "Weekly reflection : review the past week's sessions, surface patterns, and plan ahead. Use when the user wants a structured end-of-week review — 'weekly review', 'how did this week go', 'plan next week'. Do NOT use for: daily task check-in (use daily), session summary (use wrapup), or promoting insights to memory (use recap)."
---

# Weekly Reflection

Review your week, surface patterns, and set intentions for the week ahead.

Best run on Friday afternoon or over the weekend.

---

## Step 1: Identify This Week's Sessions

Determine the current week's date range (Mon–Sun).

List all session log files in `[logs_folder]/session/**/*-session-*.md` from this week (post-v2.4.0: session logs live under the dedicated `session/` subfolder). If there are none, check the past 7 days. The `-session-*` infix is no longer strictly required since `session/` only contains session logs, but kept as defense-in-depth.

Report:
> I found N sessions this week:
> - Mon (3/18): session-01 : [topic]
> - Wed (3/20): session-01, session-02 : [topics]
> - Fri (3/22): session-01 : [topic]

---

## Step 2: Read All Session Logs

Read each session log from this week. Extract:
- Topics worked on
- Decisions made
- Tasks created vs completed
- Insights noted
- Open questions

---

## Step 3: Surface Patterns

Look for:

| Pattern Type | Examples |
|-------------|---------|
| **Focus areas** | "You spent most of your time on [topic]" |
| **Progress made** | "You completed X tasks, advanced [project]" |
| **Stuck points** | "You revisited [problem] 3 times without resolution" |
| **Energy patterns** | "Most productive sessions were in the morning" |
| **Neglected areas** | "You haven't touched [goal] this week" |
| **Emerging interests** | "You captured 4 notes about [new topic]" |

---

## Step 4: Present Weekly Summary

Say:

──────────────────────────────────────────────────────────────
📅 Week of {Mon DD Mon} : {Sun DD Mon YYYY}
──────────────────────────────────────────────────────────────
Sessions: {N} total
Main focus: {primary topic}

What you worked on:
  • {Project/topic 1} : {brief status}
  • {Project/topic 2} : {brief status}

Wins this week:
  • {Something completed or progressed}

Patterns I noticed:
  • {Pattern 1}
  • {Pattern 2}

Open threads:
  • {Unresolved item}

---

## Step 5: Reflection Questions

Ask (pick 2-3 based on context):

Before we plan ahead — a few questions:
  1. What went well this week that you want to keep doing?
  2. What felt stuck or draining?
  3. What did you leave unfinished that's still important?

Wait for their answers. Take brief notes.

---

## Step 6: Set Weekly Intentions

Ask:
> What are the 3 most important things to accomplish next week?

Then help them create tasks:
```markdown
- [ ] [Intention 1] 📅 [Next Friday as default deadline]
- [ ] [Intention 2] 📅 [Next Friday]
- [ ] [Intention 3] 📅 [Next Friday]
```

Ask where to put these tasks: in a project note, or a new "Weekly Intentions" section in a project note.

---

## Step 7: Update MEMORY.md (If Warranted)

If the weekly review reveals a persistent pattern or learning, save it via `/learn` — this creates a `memory/` file with proper metadata. Do not append directly to MEMORY.md.

---

## Step 8: Write Weekly Log

Follow `../_shared/audit-log-format.md` (canonical frontmatter, append-per-day algorithm, run-section heading, failure mode) with:

- **Filename:** `YYYY-MM-DD-weekly.md` — one file per weekly run; date = the day `/weekly` was invoked, not the start-of-week. Same-day re-run → append a new `## Run HH:MM` section.
- **Tags:** `[audit-log, weekly]` (umbrella tag, replacing the old `[weekly-review]` exception).
- **Skill:** `/weekly`
- **Per-skill discriminators in frontmatter:** `week_start: YYYY-MM-DD` (Monday of the reviewed week), `week_end: YYYY-MM-DD` (Sunday), `sessions_reviewed: N` (count from Step 1), `intentions_set: N` (count from Step 6, `0` if user skipped Step 6).

Per-skill body template (canonical `## Run HH:MM` heading; metadata in first bullet):

```markdown
## Run HH:MM

- Week: YYYY-MM-DD → YYYY-MM-DD
- Sessions reviewed: N
- Intentions set: N

### Sessions This Week
- [bulleted list of session logs reviewed, by date]

### Patterns I Noticed
- [2–4 themes from the week]

### Intentions for Next Week
- [intention 1]
- [intention 2]
- [intention 3]

### Notes & Insights
- [any insights worth preserving; omit this section if none]
```

The full file (creation form) — frontmatter + heading + first run:

```markdown
---
tags: [audit-log, weekly]
skill: /weekly
date: YYYY-MM-DD
week_start: YYYY-MM-DD
week_end: YYYY-MM-DD
sessions_reviewed: N
intentions_set: N
---

# Weekly Review — YYYY-MM-DD

## Run HH:MM

- Week: YYYY-MM-DD → YYYY-MM-DD
- Sessions reviewed: N
- Intentions set: N

### Sessions This Week
…
```

---

## Step 9: Close Out

✅ Weekly note saved to `[logs_folder]/log/YYYY/MM/YYYY-MM-DD-weekly.md`.
[If tasks created]: I logged your 3 intentions for next week.
[If insights saved]: Added a pattern to your memory.

Enjoy your {weekend/time off}. See you next week!

---

## Known Gotchas

- **No sessions this week.** If the week has no session logs, skip "What you worked on" and "Patterns I noticed" — don't fabricate activity. Acknowledge it directly: "No sessions logged this week." and jump to Step 5 (reflection questions). Step 8 still writes a weekly log with `sessions_reviewed: 0`.
