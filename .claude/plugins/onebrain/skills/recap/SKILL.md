---
name: recap
description: Cross-session synthesis : reads session logs, context/, and memory/ from the past 7 days, surfaces patterns and insights, and updates MEMORY.md Key Learnings. Run periodically to keep long-term memory current.
---

# /recap : Cross-Session Synthesis

Reads session logs, and any recently-created files in `context/` and `memory/`, from the past 7 days. Surfaces patterns, decisions, and insights, then updates `MEMORY.md` Key Learnings with new, deduplicated entries.

**Distinct from `/wrapup`:** `/wrapup` summarizes the current session just ended. `/recap` looks back across multiple sessions to surface long-term patterns.

---

## Before You Begin

Read `vault.yml` and extract:
- `folders.logs` as `[logs_folder]` (default: `07-logs`)
- `folders.agent` as `[agent_folder]` (default: `05-agent`)
- `folders.archive` as `[archive_folder]` (default: `06-archive`)

---

## Step 1: Find sources from the past 7 days

**Session logs:**
Glob `[logs_folder]/**/*.md`. Filter to files whose `date` frontmatter value is within the past 7 days (today inclusive).

**Recent /learn files:**
- Glob `[agent_folder]/memory/*.md`. Keep files whose `created:` frontmatter is within the past 7 days. Store as `new_memory_files`.
- Glob `[agent_folder]/context/*.md`. Keep files whose `created:` frontmatter is within the past 7 days. Store as `new_context_files`.

Report to the user:
> Found N sessions (DD Mon – DD Mon) · M new /learn files

If no sessions AND no /learn files found:
> No sessions and no new /learn entries in the past 7 days. Nothing to recap.

Exit gracefully : do not proceed.

---

## Step 2: Read and extract from all sources

Use qmd if available for content searches; use Glob/Grep for frontmatter lookups and date-filtering.

**From session logs:** Read each log and extract:
- **Key Decisions** : choices, directions, conclusions reached
- **Insights & Learnings** : new understanding, patterns discovered
- **Recurring topics** : project names or themes that appear in ≥ 2 sessions
- **Open Questions** : questions listed in logs that have no follow-up answer in any later log

**From new `memory/` files:** Read each file in `new_memory_files`. Extract the behavioral pattern or preference described. These are direct candidates for MEMORY.md Key Learnings.

**From new `context/` files:** Read each file in `new_context_files`. Extract any **pattern-like observations** (e.g., "We always deploy on Fridays" or "Thai users expect shorter responses"). Skip raw domain facts that are reference-only (e.g., "Stack: Go + Postgres") — those belong in context/ and do not need to be in MEMORY.md.

**Tiebreaker for context/ files:** If unsure whether something is a pattern or a raw fact, apply this rule (same as /learn Step 3): "If you would change how you respond based on this information, it belongs in MEMORY.md. If it is purely reference material you look up on demand, leave it in context/."

---

## Step 3: Synthesize and display

Present the synthesis to the user before writing anything:

```
## Recap : DD Mon – DD Mon (N sessions · M /learn files)

**Patterns noticed:**
- [recurring theme across sessions, e.g. "5 of 7 sessions touched OneBrain infrastructure"]

**Key decisions:**
- [consolidated list of decisions made across sessions]

**Insights worth keeping:**
- [insight not already present in MEMORY.md Key Learnings]

**From /learn (past 7 days):**
- [behavioral pattern or observation from memory/ files, if any]

**Open threads:**
- [question that appeared in logs but was never answered]
```

If a category has nothing to report, omit it.

---

## Step 4: Dedup check

Apply this dedup table to **all** candidate entries — whether sourced from session logs, `memory/` files, or `context/` files — against the existing `## Key Learnings & Patterns` section in `[agent_folder]/MEMORY.md`:

| Case | Action |
|------|--------|
| Insight is identical or a subset of an existing entry | Drop : do not append |
| Insight extends or refines an existing entry | Merge into the existing entry; add `[conf:X]` `[verified:YYYY-MM-DD]` if the existing entry lacks them; append `_(updated YYYY-MM-DD)_` at the end of the line |
| Insight contradicts an existing entry | Mark old as `~~old entry~~ _(superseded YYYY-MM-DD)_`, keep new for append |
| Insight is genuinely new | Keep for append |

To merge: rewrite the existing bullet in-place to incorporate the new detail, keeping the original date.

After dedup, if no new insights remain:
> All insights are already captured in MEMORY.md : nothing new to add.

Exit : do not write.

---

## Step 5: Update MEMORY.md

Append each new post-dedup insight to the `## Key Learnings & Patterns` section of `[agent_folder]/MEMORY.md`:

```
- YYYY-MM-DD — [observation] `[conf:X]` `[verified:YYYY-MM-DD]`
```

**Confidence scoring** (assess at write time):

| Score | When to use |
|---|---|
| `conf:high` | Empirically tested, or confirmed across ≥ 2 sessions (including memory/ entries that also appear in session logs) |
| `conf:medium` | Observed once, plausible — default for memory/-sourced entries |
| `conf:low` | Inferred, assumed, or from a single indirect source |

Set `[verified:YYYY-MM-DD]` to today's date when first written. For merged entries, update `[verified:YYYY-MM-DD]` to today as well (the merge re-confirms the entry).

Also update the `updated:` field in the frontmatter to today's date.

**Archive eligible `memory/` files:**
"Successfully promoted" includes both: (a) entries appended as new, and (b) entries merged into an existing entry ("extends or refines" case) — both counts as promoted. For each file in `new_memory_files` that was promoted by either path (not dropped as identical/subset), offer to archive it using AskUserQuestion:
> Promoted N patterns from `memory/` to MEMORY.md. These files can now be archived:
> - `memory/YYYY-MM-DD-slug.md` — [one-line summary]
> Archive them? (yes / no)

If **yes**: move each file to `[archive_folder]/YYYY/MM/[filename]`.
If **no**: leave in place — the file remains as the detailed version.

**Never archive `context/` files** — they contain detailed domain facts that are not fully captured by a single MEMORY.md entry.

---

## Step 6: Overflow check

Count the total lines in `[agent_folder]/MEMORY.md`. If the count exceeds 180:

> MEMORY.md is now N lines (recommended limit: 180). Consider running `/distill` to synthesize older entries into a knowledge note, then trim the condensed entries from MEMORY.md.

---

## Step 7: Confirm

```
Recap complete. Added N new insights to MEMORY.md (M already captured : skipped).
```

If nothing was written (all deduped):
```
Recap complete. No new insights to add : all N insights already captured in MEMORY.md.
```
