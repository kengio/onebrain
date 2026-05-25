---
name: schedule-once
description: Interactive wizard to schedule a OneBrain skill to run ONCE at a specific datetime, then auto-uninstall. Writes a one-shot entry to onebrain.yml and invokes onebrain register-schedule.
schedulable: false
---

# /schedule-once — One-shot scheduler wizard

## Purpose

For users who want a reminder or task to fire ONCE at a specific date and time, then disappear cleanly. Walks through:
1. Which skill to fire
2. What date (YYYY-MM-DD)
3. What time (HH:MM, 24-hour)
4. Any required args (if the skill is `schedulable_with_args`)
5. Confirms preview
6. Writes one-shot entry to onebrain.yml + runs `onebrain register-schedule`

After the scheduled time, the launchd plist runs the skill once, then unloads itself and deletes the plist file.

---

## Skill flow

### Step 1: Pick skill

List all schedulable skills by reading each SKILL.md frontmatter under `.claude/plugins/onebrain/skills/`. Filter for entries where `schedulable: true` OR `schedulable_with_args: true`.

Show via `AskUserQuestion`:
- question: "Which skill would you like to schedule for a one-time run?"
- header: "Schedule a One-Shot Run"
- multiSelect: false
- options (two groups):
  - Skills with `schedulable: true` (no args required): e.g. `/daily`, `/weekly`, `/recap`, `/doctor`, `/tasks`, `/moc`
  - Skills with `schedulable_with_args: true` (args required — wizard will prompt): e.g. `/distill`, `/research`, `/summarize`, `/search`

Store: `chosen_skill` (the slash-command name, e.g. `/daily`).

### Step 2: Pick date

Prompt for `YYYY-MM-DD` via plain conversational text:
> What date should `{chosen_skill}` run? Enter a date in YYYY-MM-DD format.

Validate:
- Format must match `YYYY-MM-DD` (4-digit year, 2-digit month 01–12, 2-digit day 01–31).
- Date must be strictly in the future relative to current datetime.
- If invalid or in the past, reject with a clear message and re-prompt:
  - Malformed: `Invalid date format. Please use YYYY-MM-DD (e.g. 2026-05-15).`
  - Past: `Date must be in the future. Current time: <now>.`

Store: `run_date`.

### Step 3: Pick time

Prompt for `HH:MM` (24-hour) via plain conversational text:
> What time should it run? Enter time in HH:MM format (24-hour, e.g. 14:30).

Validate:
- Hour: 0–23.
- Minute: 0–59.
- If the entered time on the entered date is already in the past, reject with `That time has already passed today. Please enter a future time or change the date.`
- If invalid format or out of range, reject with a clear message and re-prompt.

Store: `run_time`, `run_hour`, `run_minute`.

### Step 4: Collect required args (if applicable)

If `chosen_skill` has `schedulable_with_args: true`, read its `required_args` list from the SKILL.md frontmatter and prompt for each one via `AskUserQuestion` or plain conversational text.

> What argument should be passed to `{chosen_skill}` when it runs? For example, for `/distill` you might enter a topic name like "machine learning".

Rules:
- Empty values are not accepted — re-prompt if blank.
- Reject any arg value containing a double-quote character (`"`): `Argument values cannot contain double-quote characters due to shell wrapper constraints. Please rephrase without quotes.`

Store: `skill_args` (key/value map; omit if no args).

### Step 5: Preview + confirm

Show a preview via `AskUserQuestion`:
- question: "Ready to schedule?"
- header: "Confirm One-Shot Schedule"
- multiSelect: false

Preview block:

```
{chosen_skill} will run once at {run_date} {run_time}.
After firing, the schedule auto-uninstalls.
Output → vault (07-logs/scheduler/{YYYY}/{MM}/{run_date}-{skill-name}.md)
Confirm?
```

- options:
  - label: "Yes, schedule it"
  - label: "Cancel"

If Cancel, stop with no changes.

### Step 6: Write to onebrain.yml + register

**Read onebrain.yml** (full file, parse as YAML).

**Conflict check:** Look in the `schedule:` block for any entry where:
- `skill` matches `chosen_skill`, AND
- the `at` field (one-shot) OR `cron` field produces a plist label that would collide.

If a conflict is found, ask via `AskUserQuestion`:
- question: "`{chosen_skill}` already has a scheduled entry. How would you like to proceed?"
- header: "Conflict"
- multiSelect: false
- options:
  - label: "Overwrite", description: "Replace the existing entry with this one-shot run"
  - label: "Cancel", description: "Keep the existing entry as-is"

If Cancel, stop.

**Build the one-shot entry:**

```yaml
- at: "YYYY-MM-DD HH:MM"
  skill: /skill-name
  args:           # omit entire args key if no args
    key: value
```

- If overwriting an existing entry, replace it in place.
- Otherwise, append to the `schedule:` list.
- If the `schedule:` block does not exist in onebrain.yml, create it.

**Atomic write:**
1. Load full onebrain.yml content.
2. Mutate the in-memory structure (load → mutate → write entire file).
3. Write to `onebrain.yml.tmp` in the vault root.
4. Rename `onebrain.yml.tmp` → `onebrain.yml` (atomic replace on same filesystem).
5. If write fails at any point: delete `onebrain.yml.tmp` if it exists; report the error; do not proceed to register step.

**Run from vault root:**

```
onebrain register-schedule
```

If the command fails, report the error. onebrain.yml has already been updated — the user can retry `onebrain register-schedule` manually.

### Step 7: Confirm

Say:

```
✓ Scheduled {chosen_skill} for {run_date} {run_time} (one-shot). Will auto-uninstall after firing.
```

---

## Edge cases

- **Date in the past** — reject with `Date must be in the future. Current time: <now>` (Step 2).
- **onebrain.yml missing `schedule:` block** — wizard creates it in Step 6.
- **Conflict: same skill already scheduled (recurring OR one-shot)** — `AskUserQuestion`: overwrite or cancel (Step 6).
- **Arg value contains `"`** — reject with clear error; re-prompt (Step 4). Carried from backend constraint: the one-shot shell wrapper does not support double-quote characters in argument values.
- **onebrain.yml YAML write failure** — rollback in Step 6; no partial state left on disk.
- **`schedulable_with_args` skill, no args provided** — wizard prompts in Step 4 before proceeding; empty values not accepted.

---

## Implementation notes

- Use the `yaml` library (already in CLI deps) — preserve comments and key order during write.
- Atomically replace onebrain.yml: write to tmp file → fsync → rename (POSIX-atomic on same filesystem).
- The launchd plist generated by `onebrain register-schedule` for a one-shot entry runs the skill once, then calls `launchctl bootout` + `rm -f` to remove itself — the wizard does not need to schedule cleanup; the plist handles it.
- `at:` field format is `"YYYY-MM-DD HH:MM"` (quoted string). Do not use cron syntax for one-shot entries.
- Day-of-week and cron logic are not needed here — only the `at:` field is written.
