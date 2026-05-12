---
name: search
description: General vault retrieval — answers both "what" and "why" questions across MEMORY.md, memory/, session logs, project trackers, and vault notes. Uses qmd (lex+vec+hyde) with grep fallback.
auto-invoke:
  - "search vault"
  - "find in vault"
  - "why did"
schedulable_with_args: true
required_args: [query]
---

# /search — General vault retrieval

## Purpose

First-class retrieval skill that answers both **what** and **why** questions across all knowledge layers in the OneBrain vault.

Distinct from existing skills:
- `/distill` synthesizes a topic into a *new persisted note* (write); /search is read-only
- `/recap` promotes session insights to *memory/* (write); /search is read-only
- Direct qmd query gives content matches; /search ranks by question type and surfaces decision chains

## Sources searched (in order of relevance)

1. `[agent_folder]/MEMORY.md` — always-loaded persona/active-projects
2. `[agent_folder]/memory/*.md` — match via MEMORY-INDEX topics
3. `[logs_folder]/session/**/*-session-*.md` — past session logs
4. `[projects_folder]/**/*.md` — project notes including embedded specs/plans/design docs
5. Project tracker decisions log tables (project MOCs under `[projects_folder]/`)
6. Vault notes (`[knowledge_folder]/`, `[resources_folder]/`, `[areas_folder]/`)
7. `[logs_folder]/checkpoint/*.md` — in-session-state recovery (for current-day questions)

## Tools used

- **qmd lex+vec+hyde** if `qmd_collection` is configured in vault.yml (preferred)
- **Glob + Grep fallback** if qmd unavailable
- **Heuristic question-type detection**: matches `^why\b` (or the agent's bilingual intent inference on non-English equivalents) → "why mode"; else → "what mode"

## Output format — what mode

For "what is X" / "what's the current state of X" questions, synthesize a direct answer + cite top 5 sources:

```
📌 Direct answer (1–3 sentences synthesized from sources)

📚 Sources (top 5 by relevance):
  1. <file path>:<heading> — <1-line excerpt>
  2. ...
```

## Output format — why mode

For "why did X" / "why is X" questions, reconstruct chronological decision chain:

```
🕐 Decision chain (chronological):
  YYYY-MM-DD · <event/decision> · "<key quote or rationale>"
  YYYY-MM-DD · <next event> · "<rationale>"
  ...

📚 Sources: <list of files referenced in chain>
```

## Skill flow

1. Detect question type from input (`why` keyword or default to `what`)
2. Run qmd query (lex+vec+hyde) OR grep fallback
3. Score results by question type (why → emphasize sessions + decisions logs; what → emphasize knowledge + project notes)
4. Top-K cap: 5 results by default; `--all` flag returns full ranked list
5. Format per mode above

## Known limitations

- Search quality depends on qmd index freshness — run `/qmd embed` if recent vault changes not reflected
- Why mode requires chronological events to exist; if no decision history found, falls back to what-mode output with a note

## Progress reporting

This skill is long-running for large vaults. Emit:

```
→ [step 1/4] detecting question type · routing to qmd...
→ [step 2/4] running qmd lex+vec+hyde across all sources...
→ [step 3/4] scoring + ranking results...
→ [step 4/4] formatting answer...
```
