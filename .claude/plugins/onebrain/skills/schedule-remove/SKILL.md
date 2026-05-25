---
name: schedule-remove
description: Remove a scheduled OneBrain skill. Shows the current schedule list and lets the user pick which entry to remove.
schedulable: false
---

# /schedule-remove — Remove a scheduled skill

## Purpose

Safely unschedule a skill: presents the current schedule, confirms intent, removes the entry from onebrain.yml, and unregisters the corresponding launchd job.

---

## Skill flow

### Step 1: Show current schedule

Run the `/schedule-list` logic (read onebrain.yml `schedule:` block + call `onebrain register-schedule --status`) to display the current entries.

If no entries are found:
```
No scheduled skills to remove.

→ Run /schedule-add to set one up.
```

Stop.

### Step 2: Pick entry to remove

Show via `AskUserQuestion`:
- question: "Which scheduled skill would you like to remove?"
- header: "Remove Schedule"
- multiSelect: false
- options: one option per scheduled entry, label = `/skill-name` with cron and frequency as description
  - e.g. label: `/daily`, description: `0 9 * * * — daily at 09:00`

Store: `chosen_entry` (the matched onebrain.yml schedule entry).

### Step 3: Confirm removal

Show via `AskUserQuestion`:
- question: "Remove `{chosen_skill}` scheduled at `{cron}` ({frequency_description})? This stops all automatic invocations."
- header: "Confirm Removal"
- multiSelect: false
- options:
  - label: "Yes, remove it", description: "Delete the schedule entry and unregister the launchd plist"
  - label: "Cancel", description: "Keep the schedule as-is"

If Cancel, stop.

### Step 4: Edit onebrain.yml

Read onebrain.yml. Remove the matching entry from the `schedule:` block.

Write the full updated onebrain.yml back atomically:
1. Write to `onebrain.yml.tmp` in the vault root.
2. Rename to `onebrain.yml`.

If the write fails, delete `onebrain.yml.tmp` if it exists and report the error. Do not proceed to Step 5.

### Step 5: Unregister

Run from the vault root:
```
onebrain register-schedule --refresh
```

This re-reads onebrain.yml (now without the removed entry) and deletes the corresponding launchd plist.

If the command fails, report the error. onebrain.yml has already been updated — the user can retry `onebrain register-schedule --refresh` manually.

### Step 6: Confirm

Say:
```
✓ Removed {chosen_skill} from schedule. The launchd plist has been deleted.
```

---

## Edge cases

- **No entries** — handled in Step 1; early exit with helpful message.
- **Single entry remaining** — removing it leaves an empty `schedule:` block in onebrain.yml; this is valid and the block is preserved (not deleted) so future `/schedule-add` runs can append to it.
- **onebrain.yml write failure** — rollback in Step 4; no partial state left on disk.
- **`register-schedule --refresh` failure** — launchd plist may still exist; surface it and suggest manual retry.
