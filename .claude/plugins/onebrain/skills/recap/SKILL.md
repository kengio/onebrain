---
name: recap
description: Cross-session synthesis : reads session logs from the past 7 days, surfaces patterns and insights, and updates MEMORY.md Key Learnings. Run periodically to keep long-term memory current.
---

# /recap : Cross-Session Synthesis

Reads session logs from the past 7 days, surfaces patterns, decisions, and insights across sessions, then updates `MEMORY.md` Key Learnings with new, deduplicated entries.

**Distinct from `/wrapup`:** `/wrapup` summarizes the current session just ended. `/recap` looks back across multiple sessions to surface long-term patterns.

---

## Before You Begin

Read `vault.yml` and extract:
- `folders.logs` as `[logs_folder]` (default: `07-logs`)
- `folders.agent` as `[agent_folder]` (default: `05-agent`)

---

## Step 1: Find sessions from the past 7 days

Glob `[logs_folder]/**/*.md`. Filter to files whose `date` frontmatter value is within the past 7 days (today inclusive).

Report to the user:
> Found N sessions (DD Mon – DD Mon)

If no sessions found:
> No sessions found in the past 7 days. Nothing to recap.

Exit gracefully : do not proceed.

---

## Step 2: Read and extract from each log

Read each session log. Extract:

- **Key Decisions** : choices, directions, conclusions reached
- **Insights & Learnings** : new understanding, patterns discovered
- **Recurring topics** : project names or themes that appear in ≥ 2 sessions
- **Open Questions** : questions listed in logs that have no follow-up answer in any later log

---

## Step 3: Synthesize and display

Present the synthesis to the user before writing anything:

```
## Recap : DD Mon – DD Mon (N sessions)

**Patterns noticed:**
- [recurring theme across sessions, e.g. "5 of 7 sessions touched OneBrain infrastructure"]

**Key decisions:**
- [consolidated list of decisions made across sessions]

**Insights worth keeping:**
- [insight not already present in MEMORY.md Key Learnings]

**Open threads:**
- [question that appeared in logs but was never answered]
```

If a category has nothing to report, omit it.

---

## Step 4: Dedup check

Compare every entry in "Insights worth keeping" against the existing `## Key Learnings & Patterns` section in `[agent_folder]/MEMORY.md`:

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
| `conf:high` | Empirically tested in this session, or confirmed across ≥ 2 sessions |
| `conf:medium` | Observed once, plausible but not directly tested |
| `conf:low` | Inferred, assumed, or from a single indirect source |

Set `[verified:YYYY-MM-DD]` to today's date when first written.

Also update the `updated:` field in the frontmatter to today's date.

---

## Step 6: Overflow check

Count the total lines in `[agent_folder]/MEMORY.md`. If the count exceeds 180:

> MEMORY.md is now N lines (recommended limit: 180). Consider running `/distill` to synthesize older entries into a knowledge note, then trim the condensed entries from MEMORY.md.

Do not modify `[agent_folder]/memory/` or `[agent_folder]/context/` : these are managed by `/learn` only.

---

## Step 7: Confirm

```
Recap complete. Added N new insights to MEMORY.md (M already captured : skipped).
```

If overflow warning was triggered, append:
```
MEMORY.md is now N lines : consider /learn to trim.
```

If nothing was written (all deduped):
```
Recap complete. No new insights to add : all N insights already captured in MEMORY.md.
```
