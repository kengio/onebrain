---
name: memory-review
description: "Interactive review of all memory/ files — keep, update, deprecate, or delete entries one by one"
---

# Memory Review

Interactive review session for pruning and updating memory entries.

## Data Source

Read entries from INDEX.md (already in context after session startup). Only read individual
file frontmatter when user picks `update` and needs to modify file content. This avoids
file system scanning for the listing phase.

## Edge Case: Empty INDEX

If memory/ is empty or has no active/needs-review entries → display
"No memory files to review." and stop.

## Entry Ordering

1. `needs-review` first (ordered by verified date, oldest first)
2. `active` (ordered by verified date, oldest first)
3. `deprecated` — skipped entirely

## Display Per Entry

Show each entry in this format:

[1/8] dev | active | conf:high | verified 45 days ago
      dev-workflow-superpowers
      "Superpowers flow + worktree + 3 review rounds"
      → keep / update / needs-review / deprecate / delete / skip / stop

## Option Behaviors

**keep** → bump `verified` to today only. `updated` unchanged (status did not change —
`updated` tracks status changes, not verification events).

**update** → interactive sub-menu:
- `conf`: low / medium / high / unchanged
- `type`: pick from defaults (context, behavioral, dev, project, reference) or type custom value
  (also updates INDEX.md Type column)
- `description`: rewrite one-liner (also updates INDEX.md Description column)
- `confirm` → save all changes; bump `verified` and `updated` to today;
  update INDEX.md row and file frontmatter
- `cancel` → discard all changes; return to main options for this entry

**needs-review** → sets `status: needs-review`; bumps `updated` to today. `verified` unchanged.

**deprecate** → sets `status: deprecated`; bumps `updated` to today; removes row from INDEX.md;
decrement `total_active` if entry was `active`, or `total_needs_review` if entry was `needs-review`.
`verified` unchanged. File stays in memory/ (browsable in Obsidian).

**delete** → AskUserQuestion: "Move `memory/X.md` to archive and remove from INDEX?"
Options: `confirm / cancel`
If confirm:
1. Move file to `[archive_folder]/[agent_folder]/memory/YYYY-MM/X.md`
2. Add `archived: YYYY-MM-DD` to file frontmatter
3. Remove row from INDEX.md; decrement `total_active` if status was `active`, `total_needs_review` if status was `needs-review`
4. If archive path already exists: suffix with `-NN` (e.g. `dev-workflow-02.md`) — never overwrite
5. Auto-create `[archive_folder]/[agent_folder]/memory/YYYY-MM/` folder if missing

**skip** → move to next entry, no changes.

**stop** → exit session, all unreviewed entries unchanged.

## INDEX.md Sync

Every skill that modifies INDEX.md must update these frontmatter cache fields:
- `total_active` — increment/decrement on status changes
- `total_needs_review` — increment/decrement on status changes
- `updated` — set to today after any modification

On /memory-review completion: update `vault.yml` `stats.last_memory_review: YYYY-MM-DD`.

## Edge Cases

- If entry's row is missing from INDEX.md but file exists in memory/ (out of sync) →
  skip the entry and report "INDEX out of sync — run /doctor --fix"
- All choices (keep/update/needs-review/deprecate/delete) commit immediately.
  No undo for completed actions. `stop` only preserves remaining unreviewed entries.

## Restore from Archive

To recover a soft-deleted file: manually move it back to `memory/` and remove the
`archived:` frontmatter field. Then re-add the INDEX.md row manually or run `/doctor --fix`
to rebuild INDEX.
