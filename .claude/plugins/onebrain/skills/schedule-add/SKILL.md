---
name: schedule-add
description: Interactive wizard to add a scheduled OneBrain skill. Walks user through skill selection, frequency, time, and writes to onebrain.yml + invokes onebrain register-schedule.
schedulable: false
---

# /schedule-add — Interactive scheduler wizard

## Purpose

For users who don't want to hand-edit onebrain.yml or learn cron syntax. Walks through:
1. Which skill to schedule
2. How often (Daily/Weekly/Monthly/Custom)
3. What time
4. Confirms cron preview
5. Writes to onebrain.yml + runs `onebrain register-schedule`

---

## Skill flow

### Step 0: First-run preset detection (skip if schedule already has entries)

1. Read `onebrain.yml`. Check if the `schedule:` key exists AND its value is a non-empty list.
   - If `schedule:` is missing, null, or `[]` → continue with this step (preset selector).
   - If `schedule:` has one or more entries → skip Step 0 entirely; go straight to Step 1.

2. Read the canonical preset tier table from `.claude/plugins/onebrain/skills/_shared/schedule-presets.md`. The four tiers are defined there — never duplicate them inline in this skill file.

3. Show preset selection via `AskUserQuestion`:
   - **Tier 1 — Minimal** (1 entry: `/daily` 09:00 every day)
   - **Tier 2 — Essentials (Recommended)** (3 entries: `/daily`, `/weekly` Friday, `/recap` Sunday)
   - **Tier 3 — Maintenance Plus** (6 entries: Essentials + `/doctor` monthly + `/tasks` daily + `onebrain qmd-reindex` Sunday command-mode entry)
   - **Tier 4 — Custom** (skip presets, go to manual wizard)

4. Apply the chosen tier:
   - **Tier 1, 2, or 3:** atomically write the preset entries (verbatim from `_shared/schedule-presets.md`) to `onebrain.yml` `schedule:` block (load → mutate → write entire file; use a tmp file + rename). Then run `onebrain register-schedule`. Confirm: `✓ Installed Tier N preset (M entries).`
   - **Tier 4 (Custom):** fall through to Step 1 (the existing skill picker wizard).

5. On Tier 1/2/3 success → the skill exits here. The user has scheduled entries. Subsequent invocations of `/schedule-add` will see `schedule:` is non-empty and skip Step 0, falling straight into the manual wizard for adding additional entries.

#### Edge cases

- **onebrain.yml missing entirely** → wizard creates it with the preset entries as the only content of a new `schedule:` block.
- **onebrain.yml has `schedule:` as a comment or YAML null** → treat as empty; proceed with preset selector.
- **Atomic write failure** → rollback (do not leave partial state); report the YAML error and exit.

### Step 1: Pick skill

List all schedulable skills by reading each SKILL.md frontmatter under `.claude/plugins/onebrain/skills/`. Filter for entries where `schedulable: true` OR `schedulable_with_args: true`.

Show via `AskUserQuestion`:
- question: "Which skill would you like to schedule?"
- header: "Schedule a Skill"
- multiSelect: false
- options (two groups):
  - Skills with `schedulable: true` (no args required): e.g. `/daily`, `/weekly`, `/recap`, `/doctor`, `/tasks`, `/moc`
  - Skills with `schedulable_with_args: true` (args required — wizard will prompt): e.g. `/distill`, `/research`, `/summarize`, `/search`

Store: `chosen_skill` (the slash-command name, e.g. `/daily`).

### Step 2: Collect args (if needed)

If `chosen_skill` has `schedulable_with_args: true`, prompt for required arguments.

Ask via plain conversational text (one question per arg):
> What argument should be passed to `{chosen_skill}` when it runs? For example, for `/distill` you might enter a topic name like "machine learning".

Store: `skill_args`.

### Step 3: Pick frequency

Show via `AskUserQuestion`:
- question: "How often should `{chosen_skill}` run?"
- header: "Frequency"
- multiSelect: false
- options:
  - label: "Daily", description: "Every day"
  - label: "Weekly", description: "Pick a day of the week"
  - label: "Monthly", description: "Pick a date of the month"
  - label: "Custom", description: "Enter a cron expression directly"

If Weekly: ask which day via `AskUserQuestion` (Mon/Tue/Wed/Thu/Fri/Sat/Sun).
If Monthly: ask which date (1-31) via plain text.
If Custom: ask for a raw cron string via plain text and validate format (5 fields: minute hour day month weekday).

Store: `frequency`, `frequency_detail` (day of week, date, or raw cron).

### Step 4: Pick time

(Skip this step if Custom frequency — user already provided full cron.)

Show via `AskUserQuestion`:
- question: "What time should it run?"
- header: "Time"
- multiSelect: false
- options:
  - label: "Morning — 9:00", description: "9:00 AM"
  - label: "Midday — 12:00", description: "12:00 PM"
  - label: "Evening — 18:00", description: "6:00 PM"
  - label: "Night — 22:00", description: "10:00 PM"
  - label: "Custom", description: "Enter HH:MM"

If Custom: ask for time in HH:MM format via plain text and validate (00-23 : 00-59).

Store: `run_hour`, `run_minute`.

### Step 5: Generate cron expression

Construct the cron string from frequency + time:
- Daily: `{minute} {hour} * * *`
- Weekly (e.g. Friday): `{minute} {hour} * * 5` (Mon=1 ... Sun=0 or 7)
- Monthly (e.g. 15th): `{minute} {hour} 15 * *`
- Custom: use the raw cron string from Step 3.

### Step 6: Conflict check

Read onebrain.yml `schedule:` block (if it exists). Check for an entry with the same `skill` value.

If a conflict is found, show via `AskUserQuestion`:
- question: "`{chosen_skill}` is already scheduled at {existing_cron}. Overwrite it?"
- header: "Conflict"
- multiSelect: false
- options:
  - label: "Yes, overwrite", description: "Replace the existing schedule entry"
  - label: "Cancel", description: "Keep the existing schedule as-is"

If Cancel, stop.

### Step 7: Preview + confirm

Show a preview in plain text and ask via `AskUserQuestion`:

```
{chosen_skill} will run {frequency_description} at {HH:MM}.
Cron: {cron_expression}
Output → vault (07-logs/scheduler/YYYY/MM/YYYY-MM-DD-{skill-name}.md)
Confirm?
```

- options:
  - label: "Yes, schedule it"
  - label: "Cancel"

If Cancel, stop.

### Step 8: Write to onebrain.yml

Read onebrain.yml. Locate the `schedule:` block. If the block does not exist, create it.

Build the new schedule entry:
```yaml
- skill: /daily
  cron: "0 9 * * *"
  args: ""          # omit if no args
```

If overwriting an existing entry (conflict detected in Step 6), replace that entry. Otherwise append.

Write the full updated onebrain.yml back atomically:
1. Write to a temporary file (`onebrain.yml.tmp`) in the vault root.
2. Rename to `onebrain.yml` (atomic replace).

If the write fails at any point, do not leave a partial file: delete `onebrain.yml.tmp` if it exists and report the error. Do not proceed to Step 9.

### Step 9: Register schedule

Run from the vault root:
```
onebrain register-schedule
```

If the command fails, report the error. onebrain.yml has already been updated — the user can retry `onebrain register-schedule` manually.

### Step 10: Confirm

Say:
```
✓ Scheduled {chosen_skill} at {HH:MM} {frequency_description}. Next run: {next_run_datetime}.
```

---

## Edge cases

- **onebrain.yml missing `schedule:` block** — wizard creates it in Step 8.
- **Conflict (same skill, same time)** — handled in Step 6 with overwrite prompt.
- **onebrain.yml YAML write failure** — rollback in Step 8; no partial state left on disk.
- **`schedulable_with_args` skill, no args provided** — wizard prompts in Step 2 before proceeding.
- **Invalid cron (Custom)** — validate 5 fields; if invalid, ask again.
- **Invalid HH:MM (Custom time)** — validate range; if invalid, ask again.

---

## Implementation notes

- Use `yaml` library (already in CLI deps) — preserve comments and key order during write.
- Atomically replace onebrain.yml: write to tmp → rename (POSIX-atomic on same filesystem).
- Day-of-week mapping: Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6, Sun=0.
- `next_run_datetime` is a human-readable estimate (e.g. "tomorrow 9:00", "Friday 18:00") — compute from current datetime and cron.
