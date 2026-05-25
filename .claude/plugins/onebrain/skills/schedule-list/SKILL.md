---
name: schedule-list
description: Show all scheduled OneBrain entries (skills + CLI commands) with cron/at expressions and installed-on-disk status.
schedulable: false
---

# /schedule-list — Show scheduled entries

## Purpose

Display a formatted summary of all entries currently registered in the `schedule:` block of onebrain.yml. Both skill-mode entries (`skill: /daily`) and command-mode entries (`command: onebrain` + `args: [...]`) are shown side by side, with installed-on-disk status from launchd.

---

## Skill flow

### Step 1: Read onebrain.yml

Read onebrain.yml from the vault root. Locate the `schedule:` block.

If onebrain.yml does not exist or has no `schedule:` block, or the block is empty:

```
No scheduled entries found.

→ Run /schedule-add to set one up.
```

Stop.

### Step 2: Fetch status

Read the `schedule:` block from onebrain.yml directly to get the cron/at expression and `skill`/`command` field for each entry.

Optionally run from the vault root:
```
onebrain register-schedule --status
```

This emits plain text (not JSON). Each line is one entry with the `[cron]` or `[once]` tag, the cron/at value, and either `skill: /name (k=v, k2=v2)` (skill mode with optional args) or `cmd: binary arg1 arg2` (command mode with positional argv). The `✓` / `✗` prefix indicates whether the plist file exists on disk.

The CLI does not track last-run, next-run, or last-status — that detail is in `[logs_folder]/scheduler/YYYY/MM/`.

If `onebrain register-schedule --status` is unavailable or fails: fall back to checking launchd plist existence in `~/Library/LaunchAgents/` for each entry. Compute the plist filename as `com.onebrain.<labelSafe>.plist` where `labelSafe` is the binary name (for command mode) or the skill name with leading slash stripped (for skill mode), with non-alphanumeric, non-hyphen characters replaced by `-`.

### Step 3: Format output

Print the schedule table:

```
📅 Scheduled entries:

  ✓ [cron] 0 9 * * *      skill: /daily
  ✓ [cron] 0 17 * * 5     skill: /weekly
  ✓ [cron] 0 12 * * 0     skill: /recap
  ✓ [cron] 0 9 * * *      skill: /distill (topic=this-week)
  ✓ [cron] 0 3 * * 0      cmd: onebrain qmd-reindex
  ✓ [cron] 0 5 * * *      cmd: rsync -av /vault /backup
  ✓ [once] 2026-05-13 14:30  skill: /reminder
  ✗ [cron] 0 18 * * 5     skill: /weekly (plist missing — re-run /schedule-add)
```

Column layout:
- Installed icon: `✓` = plist on disk, `✗` = plist missing
- Tag: `[cron]` (recurring) or `[once]` (one-shot at fires once then auto-deletes)
- Cron or at expression (left-padded to align across the table)
- Entry target:
  - **Skill mode:** `skill: <skill-name>` with optional `(key=value, key2=value2)` when `args:` is a map
  - **Command mode:** `cmd: <binary> <arg1> <arg2>` with positional argv joined by spaces
- Installed status note when `✗` (plist missing)

Detailed run history (stdout, stderr, error files) lives in `[logs_folder]/scheduler/YYYY/MM/`.

### Step 4: Surface errors

If `✗` entries are found:
- Append a hint line below the table: `→ Run /schedule-add to re-register missing entries` (or for command-mode entries, `→ Re-run onebrain register-schedule to re-emit plists`)

For error log detail:
- Append: `→ See [logs_folder]/scheduler/YYYY/MM/YYYY-MM-DD-{label}.err.md for failure details` where `{label}` is the skill name or command binary name.

Note: auto-pause-on-failure (⏸ paused after 3 consecutive failures) is not yet implemented in the CLI. The marker file mechanism is planned for a future release. `/doctor` currently flags 3+ consecutive `.err.md` files as CRITICAL — use that for failure monitoring.

### Step 5: Footer

After the table, append:
```
→ /schedule-add     add a new scheduled entry (skill mode wizard)
→ /schedule-once    schedule a one-shot reminder
→ /schedule-remove  remove an entry
```

For command-mode entries: note that the `/schedule-add` wizard targets skill mode only — command entries are added by editing `onebrain.yml` directly and running `onebrain register-schedule`.

---

## Edge cases

- **No entries at all** — handled in Step 1; early exit with helpful message.
- **Status command unavailable** — graceful fallback to onebrain.yml data only (Step 2).
- **Partial status** — some entries return status, others don't; show what's available and mark unknowns as `(unknown)`.
- **Cron alignment** — pad cron columns to the longest expression in the list for readable alignment.
- **Mixed skill + command** — display both interleaved per original `schedule:` order; do not sort or group by mode.
