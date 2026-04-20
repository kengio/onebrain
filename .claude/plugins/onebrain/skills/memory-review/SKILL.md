---
name: memory-review
description: "Interactive review of all memory/ files — keep, update, deprecate, or delete entries one by one"
---

# Memory Review

Interactive review session for pruning and updating memory entries.

## Data Source

Read the entry list from INDEX.md (already in context after session startup). Before
displaying the first entry, read the frontmatter of every `active` and `needs-review`
file in memory/ to fetch `conf` and `verified` — these fields are not in INDEX.md.
Only read the full file body when user picks `update` and needs to modify content.

## Edge Case: Empty INDEX

If memory/ is empty or has no active/needs-review entries → display
"No memory files to review." and stop.

## Entry Ordering

Sort all entries by `verified` date (ascending — oldest first) before starting:
1. `needs-review` entries first
2. `active` entries second
3. `deprecated` — skipped entirely

## Display Per Entry

Print this header as plain text output before making the first AskUserQuestion call.
Do not repeat it per entry and do not embed it inside any question string:
──────────────────────────────────────────────────────────────
🔬 Memory Review — {N} files to review
──────────────────────────────────────────────────────────────

Per-entry: use a single AskUserQuestion with entry details embedded in the question text.
When constructing the AskUserQuestion tool call, the `question` parameter must contain
actual newline characters in the JSON string — not backslash-n (`\n`) escape sequences.

**Primary menu** (shown for every entry):
- question (use real newlines — the lines below are separate lines in the string):
  ```
  [{n}/{N}] "{1-line description}"

  {status_emoji} {status}  ·  conf: {level}  ·  📅 {X} days ago
  🏷️ {topics}
  ──────────────────────────────────────────────────────────────
  `{filename}.md`

  What would you like to do?
  ```
  Status emoji: 🟢 active, 🟡 needs-review, ⚫ deprecated
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
  - label: "skip", description: "Advance to next entry, no changes to this entry"

After any Manage action completes (including "skip"), advance to the next entry's Primary menu.

## Option Behaviors

**keep** → bump `verified` to today only. `updated` unchanged (status did not change —
`updated` tracks status changes, not verification events). Advance to next entry.

**update** → two sequential AskUserQuestion calls:

Call 1 — pick field to edit:
- options: conf-low / conf-medium / conf-high / conf-unchanged
- After selecting conf: apply immediately, then show Call 2.

Call 2 — additional edits:
- options: change-type / change-description / confirm / cancel
- `change-type` → show a third AskUserQuestion with type options:
  context / behavioral / dev / project / reference / cancel.
  After picking: apply, return to Call 2.
- `change-description` → prompt for new description as free text (plain text response,
  not AskUserQuestion). After user replies: apply, return to Call 2.
- `confirm` → save all changes; bump `verified` and `updated` to today;
  update INDEX.md row and file frontmatter. Advance to next entry.
- `cancel` → discard all changes; return to Primary menu for this entry.

**needs-review** (via manage...) → sets `status: needs-review`; bumps `updated` to today.
`verified` unchanged. Advance to next entry.

**deprecate** (via manage...) → sets `status: deprecated`; bumps `updated` to today;
removes row from INDEX.md; decrement `total_active` if entry was `active`, or
`total_needs_review` if entry was `needs-review`. `verified` unchanged.
File stays in memory/ (browsable in Obsidian). Advance to next entry.

**delete** (via manage...) → AskUserQuestion: "Move `memory/X.md` to archive and remove from INDEX?"
Options: `confirm / cancel`
If confirm:
1. Move file to `[archive_folder]/[agent_folder]/memory/YYYY-MM/X.md`
2. Add `archived: YYYY-MM-DD` to file frontmatter
3. Remove row from INDEX.md; decrement `total_active` if status was `active`, `total_needs_review` if status was `needs-review`
4. If archive path already exists: suffix with `-NN` (e.g. `dev-workflow-02.md`) — never overwrite
5. Auto-create `[archive_folder]/[agent_folder]/memory/YYYY-MM/` folder if missing
If confirm: advance to next entry. If cancel: return to Manage menu for this entry.

**skip** (via manage...) → advance to next entry, no changes to this entry.

**stop** → exit session, all unreviewed entries unchanged.

## INDEX.md Sync

Every skill that modifies INDEX.md must update these frontmatter cache fields:
- `total_active` — increment/decrement on status changes
- `total_needs_review` — increment/decrement on status changes
- `updated` — set to today after any modification

On /memory-review completion: update `vault.yml` `stats.last_memory_review: YYYY-MM-DD`.
Update regardless of whether any changes were made — the field tracks when the user last
reviewed, not when they last changed something. Only skip the update if the user invoked
**stop** without completing any entry action (keep, update, manage..., or skip).

## Completion

After the review session ends:
✅ Memory review complete — kept {N}, updated {M}, flagged {R}, deprecated {P}, deleted {Q}.

(`flagged` = entries moved to `needs-review` status via manage...)

Note: If more than 40 entries, review shows all entries sequentially (no truncation needed — user controls pace via manage.../stop).

## Edge Cases

- If entry's row is missing from INDEX.md but file exists in memory/ (out of sync) →
  silently pass over the entry and report "INDEX out of sync — run /doctor --fix"
- All choices except stop and skip commit immediately (keep, update, and via manage...:
  needs-review, deprecate, delete). No undo for completed actions. `stop` only preserves
  remaining unreviewed entries.

## Restore from Archive

To recover a soft-deleted file: manually move it back to `memory/` and remove the
`archived:` frontmatter field. Then re-add the INDEX.md row manually or run `/doctor --fix`
to rebuild INDEX.
