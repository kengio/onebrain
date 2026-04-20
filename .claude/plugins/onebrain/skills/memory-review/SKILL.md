---
name: memory-review
description: "Interactive review of all memory/ files — keep, update, deprecate, or delete entries one by one. Use when the user wants to audit and prune accumulated memory — 'review my memory', 'clean up what you remember'. Do NOT use for: teaching a new fact (use learn), recalling something specific (read memory directly), or batch-promoting session insights (use recap)."
---

# Memory Review

Interactive review session for pruning and updating memory entries.

## Data Source

Read the entry list from MEMORY-INDEX.md (already in context after session startup). Before
displaying the first entry, read the frontmatter of every `active` and `needs-review`
file in memory/ to fetch `conf` and `verified` — these fields are not in MEMORY-INDEX.md.
Only read the full file body when user picks `update` and needs to modify content.

## Edge Case: Empty MEMORY-INDEX

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
  - label: "skip", description: "Advance to next entry, no changes to this entry"
  - label: "needs-review", description: "Flag for later review"
  - label: "deprecate", description: "Mark as deprecated (keeps file, removes from active index)"
  - label: "delete", description: "Move to archive and remove from index"

After any Manage action completes, advance to the next entry's Primary menu.

## Option Behaviors

**keep** → bump `verified` to today only. `updated` unchanged (status did not change —
`updated` tracks status changes, not verification events). Advance to next entry.

**update** → two sequential AskUserQuestion calls. All changes are staged until `confirm`;
nothing is written until the user confirms. `cancel` at any point discards all staged changes.

Call 1 — set confidence:
- options: conf-unchanged / conf-low / conf-medium / conf-high
- `conf-unchanged` is listed first (safe default for confidence only — it does NOT cancel
  the update flow; always advance to Call 2 after any selection in Call 1)
- After selecting: stage the conf change, then show Call 2.

Call 2 — additional edits (cancel first — safe default, discards all staged changes):
- options:
  - label: "cancel", description: "Discard all staged changes, return to Primary menu"
  - label: "change-type", description: "Change the memory type"
  - label: "change-description", description: "Rewrite the one-liner description"
  - label: "confirm", description: "Save all staged changes and advance to next entry"
- `change-type` → type selection split across two menus (4-option limit):
  - Call 3a: cancel / context / behavioral / more...
  - Call 3b (if "more..."): dev / project / reference / back
  `cancel` (Call 3a) → discard type change, return to Call 2.
  `back` (Call 3b) → return to Call 3a.
  To exit Call 3b without picking a type: back → Call 3a → cancel → Call 2.
  After picking a type in Call 3a or Call 3b: stage the change, return to Call 2.
- `change-description` → prompt for new description as free text (plain text response,
  not AskUserQuestion). After user replies: stage the change, return to Call 2.
- `confirm` → write all staged changes; bump `verified` and `updated` to today;
  update MEMORY-INDEX.md row and file frontmatter. Advance to next entry.
- `cancel` → discard all staged changes; return to Primary menu for this entry.

**needs-review** (via manage...) → sets `status: needs-review`; bumps `updated` to today.
`verified` unchanged. Advance to next entry.

**deprecate** (via manage...) → sets `status: deprecated`; bumps `updated` to today;
removes row from MEMORY-INDEX.md; decrement `total_active` if entry was `active`, or
`total_needs_review` if entry was `needs-review`. `verified` unchanged.
File stays in memory/ (browsable in Obsidian). Advance to next entry.

**delete** (via manage...) → AskUserQuestion: "Move `memory/X.md` to archive and remove from MEMORY-INDEX?"
- options:
  - label: "cancel", description: "Return to Manage menu, no changes"
  - label: "confirm", description: "Archive file and remove from MEMORY-INDEX"
If cancel: return to Manage menu for this entry.
If confirm:
1. Move file to `[archive_folder]/[agent_folder]/memory/YYYY-MM/X.md`
2. Add `archived: YYYY-MM-DD` to file frontmatter
3. Remove row from MEMORY-INDEX.md; decrement `total_active` if status was `active`, `total_needs_review` if status was `needs-review`
4. If archive path already exists: suffix with `-NN` (e.g. `dev-workflow-02.md`) — never overwrite
5. Auto-create `[archive_folder]/[agent_folder]/memory/YYYY-MM/` folder if missing
Advance to next entry.

**skip** (via manage...) → advance to next entry, no changes to this entry.

**stop** → exit session, all unreviewed entries unchanged.

## MEMORY-INDEX.md Sync

Every skill that modifies MEMORY-INDEX.md must update these frontmatter cache fields:
- `total_active` — increment/decrement on status changes
- `total_needs_review` — increment/decrement on status changes
- `updated` — set to today after any modification

On /memory-review completion: update `vault.yml` `stats.last_memory_review: YYYY-MM-DD`.
Update regardless of whether any changes were made — the field tracks when the user last
reviewed, not when they last changed something. Only skip the update if the user invoked
**stop** without completing any entry action (keep, update, manage..., or skip).

## Completion

After the review session ends:
✅ Memory review complete — kept {N}, updated {M}, skipped {S}, flagged {R}, deprecated {P}, deleted {Q}.

(`skipped` = entries passed via manage... → skip; `flagged` = entries moved to `needs-review` via manage...)

Note: If more than 40 entries, review shows all entries sequentially (no truncation needed — user controls pace via manage.../stop).

## Edge Cases

- If entry's row is missing from MEMORY-INDEX.md but file exists in memory/ (out of sync) →
  pass over the entry and output: "MEMORY-INDEX out of sync — run /doctor --fix"
- `keep`, `needs-review`, `deprecate`, `delete` commit immediately. No undo.
  `update` commits only on explicit `confirm` (cancel at any stage discards all staged changes).
  `stop` and `skip` (via manage...) never commit.

## Restore from Archive

To recover a soft-deleted file: manually move it back to `memory/` and remove the
`archived:` frontmatter field. Then re-add the MEMORY-INDEX.md row manually or run `/doctor --fix`
to rebuild MEMORY-INDEX.md.
