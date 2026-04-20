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

Show this header once before the first entry (not repeated per entry):
──────────────────────────────────────────────────────────────
🔬 Memory Review — {N} files to review
──────────────────────────────────────────────────────────────

Per-entry: use a single AskUserQuestion with entry details embedded in the question text.
Use real newline characters in the question string — not `\n` escape sequences.

**Primary menu** (shown for every entry):
- question:
  "[{n}/{N}] {topics} | {status} | conf:{level} | verified {X} days ago
  `{filename}.md`
  "{1-line description}"

  What would you like to do?"
- header: "Memory Review [{n}/{N}]"
- multiSelect: false
- options:
  - label: "keep", description: "Bump verified date to today, no changes"
  - label: "update", description: "Edit confidence, type, or description"
  - label: "manage...", description: "Flag, deprecate, or delete this entry"
  - label: "stop", description: "Exit review, leave remaining entries unchanged"

**Manage menu** (shown only when user picks "manage..." from Primary):
- question: "`{filename}.md` — choose an action:"
- header: "Manage [{n}/{N}]"
- multiSelect: false
- options:
  - label: "needs-review", description: "Flag for later review"
  - label: "deprecate", description: "Mark as deprecated (keeps file, removes from active index)"
  - label: "delete", description: "Move to archive and remove from index"
  - label: "back", description: "Return to Primary menu for this entry, no changes"

After any Manage action completes (except "back"), advance to the next entry's Primary menu.
"back" returns to the same entry's Primary menu.

## Option Behaviors

**keep** → bump `verified` to today only. `updated` unchanged (status did not change —
`updated` tracks status changes, not verification events). Advance to next entry.

**update** → interactive sub-menu:
- `conf`: low / medium / high / unchanged
- `type`: pick from defaults (context, behavioral, dev, project, reference) or type custom value
  (also updates INDEX.md Type column)
- `description`: rewrite one-liner (also updates INDEX.md Description column)
- `confirm` → save all changes; bump `verified` and `updated` to today;
  update INDEX.md row and file frontmatter. Advance to next entry.
- `cancel` → discard all changes; return to Primary menu for this entry

**needs-review** (via manage...) → sets `status: needs-review`; bumps `updated` to today. `verified` unchanged.

**deprecate** (via manage...) → sets `status: deprecated`; bumps `updated` to today; removes row from INDEX.md;
decrement `total_active` if entry was `active`, or `total_needs_review` if entry was `needs-review`.
`verified` unchanged. File stays in memory/ (browsable in Obsidian).

**delete** (via manage...) → AskUserQuestion: "Move `memory/X.md` to archive and remove from INDEX?"
Options: `confirm / cancel`
If confirm:
1. Move file to `[archive_folder]/[agent_folder]/memory/YYYY-MM/X.md`
2. Add `archived: YYYY-MM-DD` to file frontmatter
3. Remove row from INDEX.md; decrement `total_active` if status was `active`, `total_needs_review` if status was `needs-review`
4. If archive path already exists: suffix with `-NN` (e.g. `dev-workflow-02.md`) — never overwrite
5. Auto-create `[archive_folder]/[agent_folder]/memory/YYYY-MM/` folder if missing

**back** (via manage...) → return to Primary menu for this entry, no changes.

**stop** → exit session, all unreviewed entries unchanged.

## INDEX.md Sync

Every skill that modifies INDEX.md must update these frontmatter cache fields:
- `total_active` — increment/decrement on status changes
- `total_needs_review` — increment/decrement on status changes
- `updated` — set to today after any modification

On /memory-review completion: update `vault.yml` `stats.last_memory_review: YYYY-MM-DD`.
Update regardless of whether any changes were made — the field tracks when the user last reviewed, not when they last changed something. Only skip the update if the user invoked **stop** before processing any entries.

## Completion

After the review session ends:
✅ Memory review complete — kept {N}, updated {M}, deprecated {P}, deleted {Q}.

Note: If more than 40 entries, review shows all entries sequentially (no truncation needed — user controls pace via manage.../stop).

## Edge Cases

- If entry's row is missing from INDEX.md but file exists in memory/ (out of sync) →
  skip the entry and report "INDEX out of sync — run /doctor --fix"
- All choices except stop commit immediately (keep, update, and via manage...: needs-review,
  deprecate, delete). No undo for completed actions. `stop` only preserves remaining unreviewed entries.

## Restore from Archive

To recover a soft-deleted file: manually move it back to `memory/` and remove the
`archived:` frontmatter field. Then re-add the INDEX.md row manually or run `/doctor --fix`
to rebuild INDEX.
