---
name: recap
description: "Batch-promote recurring insights from session logs into memory/ files with frequency filtering. Use when the user wants to extract persistent lessons or patterns from recent sessions — 'recap my recent sessions', 'what have I been learning lately'. Do NOT use for: saving a single fact now (use learn), writing today's session log (use wrapup), or synthesizing a specific topic into a note (use distill)."
---

# Recap

Batch-promotes insights from session logs into memory/ files. Applies frequency filtering
to ensure only recurring insights are promoted. Does NOT write to MEMORY.md — Critical
Behaviors are promoted exclusively via /learn.

## Session Log Discovery

Glob `[logs_folder]/**/*-session-*.md`; filter to files WITHOUT `recapped:` frontmatter field.
Process only those (faster than scanning all logs).

If no unrecapped logs found → tell user "No unrecapped session logs found." and stop.

## Run Threshold

Read `recap.min_sessions` from `vault.yml` (default: `6` if field absent).
Read `recap.min_frequency` from `vault.yml` (default: `2` if field absent).

**1 unrecapped log:**
→ warn: "Only 1 session log — promotion filter requires at least {min_frequency} sessions."
→ stop (nothing can pass frequency filter with only 1 log)

**2 to (min_sessions - 1) unrecapped logs:**
→ warn: "{N}/{min_sessions} sessions — below threshold. Recommended to wait for more sessions. Run recap now?"
→ AskUserQuestion: `run-now / wait`
→ if `wait`: stop without processing

**≥ min_sessions unrecapped logs:**
→ proceed immediately, no confirmation needed

## Promotion Filter (always applied, regardless of log count)

After deciding to proceed, apply frequency filter to all extracted insights:
- Promote only insights whose topic appears in ≥ min_frequency of the session logs being processed
- Single-occurrence insights → skip; insight stays in session log (accessible later via /distill)

Example (min_frequency=2, 8 logs):
- Topic "recap"    → appears in logs 1, 3, 5, 7 → ✅ promote
- Topic "dreaming" → appears in log 2 only       → ⏭ skip
- Topic "worktree" → appears in logs 4, 6        → ✅ promote

## Conflict Handling

When insights conflict with existing memory files, scan ONLY files with `status: active`
or `status: needs-review` — skip deprecated files.

Collect ALL conflicts first, then resolve sequentially:

──────────────────────────────────────────────────────────────
⚠️  {N} conflicts found — resolving one at a time
──────────────────────────────────────────────────────────────
[{n}/{N}] 💡 insight from session {YYYY-MM-DD}:
      "{insight text}"

      Conflicts with `memory/{filename}.md`

Then AskUserQuestion:
- question: "How should I handle this conflict?"
- header: "Conflict [{n}/{N}]"
- multiSelect: false
- options:
  - label: "update", description: "Merge insight into existing file (old content still partially correct)"
  - label: "supersede", description: "Create new file, deprecate old (old content fully outdated)"
  - label: "separate", description: "Create new file separately (no conflict, keep both)"
  - label: "skip", description: "Discard this insight, move on"

Options:
- **update** → merge insight into existing file in-place, bump `verified`
- **supersede** → create new file; deprecate old; remove old row from MEMORY-INDEX.md;
  set `supersedes:` on new, `superseded_by:` on old
- **separate** → create new file, no changes to existing
- **skip** → discard this insight, move on

## Memory Consolidation

After resolving conflicts, scan for files with overlapping topics.
Build a topic frequency map from all active+needs-review files.
Scan only files whose topics appear in 2+ files — skip deprecated.

Resolve sequentially [1/N]:

[{n}/{N}] 🔀 Overlapping topics — merge recommended
  `{file-a}.md`  (topics: {a}, {b})
  `{file-b}.md`  (topics: {a}, {b}, {c})

Then AskUserQuestion:
- question: "Merge these overlapping memory files?"
- header: "Consolidate [{n}/{N}]"
- multiSelect: false
- options:
  - label: "merge", description: "Synthesize into one file (preserves all unique information)"
  - label: "skip", description: "Leave both files as-is"

**merge:**
1. Read both files
2. Synthesize (do NOT concatenate) into one coherent document preserving all unique information
3. Name new file after shared topics (e.g. `dev-workflow-worktree.md`)
4. Frontmatter: keep highest `conf`; most recent `verified`; if either was `needs-review`
   → merged file inherits `needs-review` (caution wins); update `total_needs_review` accordingly
5. Deprecate both old files + remove their rows from MEMORY-INDEX.md; for each deprecated file:
   decrement `total_active` if it was `active`, or `total_needs_review` if it was `needs-review`
6. Add new file to MEMORY-INDEX.md; increment `total_active` (or `total_needs_review` if inherited `needs-review`)

**Contradiction during merge:** if files contain contradicting facts, do NOT auto-pick.
AskUserQuestion showing both versions: `keep version A / keep version B / cancel merge`

**skip** → leave both files as-is, move to next opportunity

## Order of Operations

1. Read `recap.min_sessions` and `recap.min_frequency` from `vault.yml` (apply defaults if absent)
2. Apply run threshold check (warn / stop / proceed per rules above)
3. Extract insights from all unrecapped session logs; apply promotion filter (`min_frequency`)
4. Collect and resolve all conflicts (sequential [1/N])
5. Run memory consolidation (sequential [1/N])
6. For EVERY processed session log (whether it produced insights or not):
   - Set `recapped: YYYY-MM-DD` in frontmatter
   - Extract 2–4 keywords from log content → set `topics: [...]` in frontmatter
7. `auto-saved: true` and `synthesized_from_checkpoints: true` logs processed same way
8. Update `vault.yml` `stats.last_recap: YYYY-MM-DD`

## Writing Promoted Insights

Each insight that passes the frequency filter:
- Write to `memory/kebab-case-topic.md` with frontmatter:
  `tags: [agent-memory], source: /recap, status: active, conf: medium, verified: today,
  updated: today, created: today, topics: [...]`
- Filename collision: if target exists, suffix with `-NN` automatically (no user prompt —
  batch mode)
- Infer `type` from content (same 5 categories as /learn): behavioral / context / dev / project / reference — pick silently, no prompt
- Add row to MEMORY-INDEX.md: `| [[memory/filename]] | topic1, topic2 | {inferred-type} | active | description |`
- Update MEMORY-INDEX.md `updated:` and `total_active` counter

Do NOT write to MEMORY.md. Critical Behaviors are promoted exclusively via /learn.

## Output

### No unrecapped logs
✅ No unrecapped session logs found.

### Completion (after all conflicts + consolidations resolved)
```
──────────────────────────────────────────────────────────────
💡 Recap — {N} sessions processed
──────────────────────────────────────────────────────────────
Promoted {N} insights to memory/:
  • `{filename}.md` — {topic}

{N} session logs marked recapped.
→ Run /distill to compress a completed thread into a knowledge note.
```
