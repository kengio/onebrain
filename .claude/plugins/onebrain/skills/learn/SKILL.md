---
name: learn
description: "Teach the agent a new fact or behavioral preference and save it to memory/ for future recall. Use when the user says 'remember that', 'from now on', 'always do X', or corrects agent behavior they want persisted. Do NOT use for: capturing a general note or idea (use capture), saving a session summary (use wrapup), or promoting recurring patterns from many sessions (use recap)."
---

# Learn

Teach the agent a new fact or behavioral preference. Writes immediately to memory/ — no batch processing.

## One-File-Per-Concept Rule

If the user provides multiple facts in one /learn call, create separate files for each concept.
Do not combine multiple facts into one file.

**Why:** Memory files are the unit of deprecation. If fact A becomes outdated but B stays valid, a combined file forces you to either keep stale A or discard still-valid B. Separate files let each fact be independently deprecated or superseded.

## Active Projects Intent Detection

Write to `MEMORY.md ## Active Projects` ONLY when the user message explicitly references
a project lifecycle event.

Triggers Active Projects update (write to MEMORY.md):
- "starting project X", "project Y is done", "adding project Z", "updating status of project A"

Does NOT trigger (write to memory/ file instead):
- "in project X we use Y", "I worked on project X before"

When unclear → AskUserQuestion:
"Add to Active Projects in MEMORY.md, or create a memory file?"
Options: `active-projects / memory-file`

## Contradiction Detection

Before writing a new file, grep `memory/` for files with overlapping topics or similar content.
Scan ONLY files with `status: active` or `status: needs-review` — skip deprecated files.

**Why:** Deprecated files are intentionally retired. Re-surfacing them as conflicts would create ghost conversations about facts the user has already decided to discard.

If a potential conflict is found, show this display block first:
⚠️ Possible conflict with `memory/{filename}.md`
  New: "{new fact}"
  Existing: "{existing fact}"

Then AskUserQuestion:
- question: "How should I handle this conflict?"
- header: "Conflict"
- multiSelect: false
- options:
  - label: "update", description: "Merge new fact into existing file (old content still partially correct)"
  - label: "supersede", description: "Create new file, deprecate old (old content fully outdated)"
  - label: "separate", description: "Create new file separately (no conflict, keep both)"

**update** → read existing file, merge new fact in-place, bump `verified` to today.
No new file created, MEMORY-INDEX.md unchanged.

**supersede** → create new file; set old file `status: deprecated` (regardless of previous
status); remove old file's row from MEMORY-INDEX.md; add `supersedes: old-file.md` to new file's
frontmatter. Also set `superseded_by: new-file.md` on the old file's frontmatter.

**separate** → create new file as normal, no changes to existing file.

## Filename Collision Check

Before writing a new file, check if `memory/X.md` already exists (where X is the
kebab-case name derived from the concept). If yes — even with different topics — surface
via AskUserQuestion: `overwrite / rename / cancel`

Rename suffix: `-NN`, auto-incrementing until a free slot is found.
Example: `dev-workflow.md` exists → try `dev-workflow-02.md` → `dev-workflow-03.md`, etc.

## After Writing a New File (applies only when creating a new file — not when choosing `update`)

1. **Infer `type` from content semantics:**
   - "always do X" / "use Y when Z" → `behavioral`
   - "repo path / config / setup" → `context`
   - "dev workflow / git / PR" → `dev`
   - "decision about project X" → `project`
   - "external link / reference" → `reference`
   - If ambiguous → AskUserQuestion with these 5 options as choices

2. Extract `topics` (2–4 keywords from content)

3. Write memory file frontmatter:
   ```yaml
   ---
   tags: [agent-memory]
   created: YYYY-MM-DD
   source: /learn
   topics: [keyword1, keyword2]
   type: [inferred type]
   status: active
   conf: medium
   verified: YYYY-MM-DD
   updated: YYYY-MM-DD
   ---
   ```

4. Add row to MEMORY-INDEX.md table:
   `| [[memory/filename]] | topic1, topic2 | type | active | description |`

5. Update MEMORY-INDEX.md frontmatter:
   - `updated:` → today
   - `total_active` → increment by 1

6. If `supersede` was chosen: additionally set `supersedes: old-file.md` in new file's
   frontmatter and `superseded_by: new-file.md` in old file's frontmatter.

## Confirmation

After writing or updating the file, say in one line:
🧠 Learned: {brief description of what was saved or updated}.

---

## Known Gotchas

- **Conflict detection is shallow by default.** Grepping MEMORY-INDEX.md Topics column may miss a file whose topics field is broad but whose content overlaps. When a candidate file is found, read its first 20 lines before concluding there is or is not a conflict.

- **`type` inference edge case.** "I always use library X for Y in project Z" reads as behavioral but is often project context. When uncertain between `behavioral` and `context`, prefer `behavioral` — it triggers in more situations and is easier to deprecate if the project changes.

- **`-NN` collision suffix must keep incrementing.** If `dev-workflow.md` through `dev-workflow-05.md` all exist, increment to `-06`. Do not stop at the first suffix you try.

- **`update` vs `supersede` distinction.** `update` is for facts that are partially still true (add new nuance to existing file). `supersede` is when the old fact is fully wrong or replaced. If unsure, surface both options rather than guessing.

## In-Skill Examples

**Input:** "always run 3 review rounds before merging any PR — we got burned when a PR slipped through with a broken import"

**Good output (behavioral memory file body):**
```
Run minimum 3 independent review rounds before merging any PR.

**Why:** A PR slipped through with a broken import when fewer rounds were used — multiple independent reviewers catch different issue types.
**How to apply:** After implementation is complete, dispatch 3 review sub-agents before running `gh pr create`.
```

**Input:** "remember that the OneBrain source repo is at ~/projects/onebrain"

**Good output (context memory file — minimal one-liner body):**
```
OneBrain source repo is at ~/projects/onebrain.
```

(Simple factual memories do not need **Why:** / **How to apply:** structure — use it only when the rule needs reasoning to be applied correctly in edge cases.)
