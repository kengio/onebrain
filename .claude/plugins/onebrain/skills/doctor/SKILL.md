---
name: doctor
description: Diagnose vault and plugin health — checks broken links, orphan notes, stale MEMORY.md entries, inbox backlog, and plugin config validity
---

# Doctor

Diagnose the health of your OneBrain vault and plugin configuration. Inspired by `brew doctor` and `npm doctor`.

Usage:
- `/doctor` — full check (vault + config)
- `/doctor --vault` — vault health only
- `/doctor --config` — plugin config only
- `/doctor --fix` — auto-fix safe issues (stale confidence scores + broken wikilinks via fuzzy match)

**Flag detection:** Determine active flags from the user's message. `--vault` = user mentions vault-only or health check; `--config` = user mentions config or plugin check; `--fix` = user explicitly asks to fix or auto-fix. Default (no flags mentioned) = run all checks.

---

## Step 1: Read vault.yml

Extract folder paths and assign these variables for all steps below:
- `[agent_folder]` = `folders.agent` (default: `05-agent`)
- `[logs_folder]` = `folders.logs` (default: `07-logs`)
- `[inbox_folder]` = `folders.inbox` (default: `00-inbox`)
- `[qmd_collection]` = `qmd_collection`

If vault.yml is missing, flag immediately:
> ⛔ vault.yml not found — OneBrain may not be configured correctly.

---

## Step 2: Run Checks

Run all applicable checks based on flags (default: all). Collect findings before reporting.

### Vault Checks (`--vault`)

**Broken wikilinks:**
- Grep all `.md` files in `01-projects/`, `02-areas/`, `03-knowledge/`, `04-resources/`, `[agent_folder]/` for `\[\[.*?\]\]`
- **Skip** wikilinks found inside fenced code blocks (between ` ``` ` fences), blockquote lines (lines beginning with `>`), or inline code spans (the entire `[[...]]` is enclosed within backticks on that line)
- For each wikilink, extract the note name: strip any `|display text` suffix **and** any `#anchor` fragment (e.g. `[[Note#section|label]]` → match name is `Note`; preserve full original text for display)
- Check if a `.md` file with that exact name exists anywhere in the vault (case-insensitive)
- Flag any that don't resolve; store as: `{ broken_link, display_text, anchor, source_file, source_line }` (preserving all parts for accurate replacement later)

**Orphan notes:**
- Find notes in `03-knowledge/` and `04-resources/` that have no inbound wikilinks from any other note
- These may be disconnected from the knowledge graph
- Report only — no auto-fix (linking requires semantic judgment; use /connect instead)

**Stale MEMORY.md entries:**
- Read `[agent_folder]/MEMORY.md`. If the file does not exist, skip all MEMORY.md checks (stale entries, size) and report: `🟡 MEMORY.md: not found at [agent_folder]/MEMORY.md — run /onboarding`
- Read Key Learnings
- **Skip** lines that begin with `~~` (already superseded — do not flag as stale)
- Flag entries where `[verified:YYYY-MM-DD]` is older than 90 days
- Flag entries with no `[verified:...]` tag at all
- Flag entries with `[conf:low]` where `[verified:YYYY-MM-DD]` is older than 30 days (or has no `[verified:...]` tag)

**MEMORY.md size:**
- Count lines in `[agent_folder]/MEMORY.md`
- Warn if count > 180: suggest running /distill to synthesize older entries into a knowledge note, then trim the condensed entries from MEMORY.md

**Inbox backlog:**
- Count files in `[inbox_folder]/*.md`
- Warn if count > 10: suggest running /consolidate

**Old unmerged checkpoints:**
- Glob `[logs_folder]/**/*-checkpoint-*.md`
- Read the frontmatter of each file; keep files where `merged` is **absent** from frontmatter **or** is not `true` — excluding only files where `merged: true` is explicitly set
- Keep only files whose date (from filename) is older than 7 days
- Suggest running /wrapup

### Config Checks (`--config`)

**vault.yml:**
- Verify all declared folder paths exist in the vault
- Check `timezone` is a non-empty string
- Check `qmd_collection` is present (warn if absent — qmd search won't work)

**plugin.json:**
- Read `.claude/plugins/onebrain/.claude-plugin/plugin.json`
- Verify `name`, `version`, `description` fields exist and are non-empty

**INSTRUCTIONS.md:**
- Check file exists at `.claude/plugins/onebrain/INSTRUCTIONS.md`

---

## Step 3: Report Findings

Use this format:

```
## OneBrain Doctor · YYYY-MM-DD

### Vault
🔴 Broken links (N): [[Missing Note]] in "Source Note"
🟡 Orphan notes (N): 03-knowledge/topic/Note.md
🟡 Stale MEMORY.md entries (N): not verified in 90+ days
🟡 MEMORY.md size: N lines — consider /distill to compress
🟢 MEMORY.md size: OK (N lines)
🟡 Inbox backlog: N files — consider /consolidate
🟢 Checkpoints: all merged

### Config
🟢 vault.yml: OK
🟢 plugin.json: OK (vX.X.X)
🔴 qmd_collection: missing — qmd search will not work

---
N issues found (M critical 🔴, P warnings 🟡)
Run /doctor --fix to repair broken wikilinks and stale memory entries.
```

If no issues:
```
✅ Everything looks healthy. No issues found.
```

---

## Step 4: Auto-fix (`--fix` flag only)

Run both fix passes. Each pass confirms with the user before writing.

### Pass A: MEMORY.md confidence scores

Collect auto-fixable issues from the Key Learnings scan:
- `[conf:high]` entries not verified in 90+ days → downgrade to `[conf:medium]`
- `[conf:medium]` entries not verified in 180+ days → downgrade to `[conf:low]`
- Entries with no `[conf:...]` tag → add `[conf:medium]` as baseline, then apply staleness rules above
- Entries with no `[verified:...]` tag → add `[verified:YYYY-MM-DD]` using the **date prefix from the entry line** (the `YYYY-MM-DD` at the start of each `- YYYY-MM-DD —` bullet); if no date prefix exists, treat the entry as maximally stale — flag it as requiring manual review rather than assigning today's date (assigning today would incorrectly reset the staleness clock)

If 0 issues: skip this pass, note "No MEMORY.md issues to fix."

Otherwise, confirm with AskUserQuestion:
> Found N MEMORY.md issues. Apply confidence score fixes?
> - Add missing [conf:medium] baseline to untagged entries
> - Downgrade stale confidence scores
> - Add missing [verified:...] dates from entry date prefixes
> - Flag maximally stale entries (no [verified:] tag AND no date prefix) for manual review — these will NOT be auto-fixed

After applying auto-fixes, if any maximally stale entries were found, list each one verbatim as a blockquote so the user can review and update manually:
> ⚠️ Maximally stale — needs manual review:
> > `- [entry text]`

### Pass B: Broken wikilink fuzzy-fix

If no broken links were found in Step 2: note "No broken links to fix." and skip this pass.

**Group by broken link name** first: if the same broken link name appears in multiple source files, treat them as one group (one confirmation covers all occurrences).

For each unique broken link name:

1. **Fuzzy-match candidates:** Search all `.md` filenames in the vault for names similar to the broken link name (use the bare name without `#anchor`). Similarity heuristics (apply in order):
   - Case-insensitive exact match → confident match (stop)
   - One is a substring of the other (e.g. `[[OneBrain v2]]` → `OneBrain v2.0.0 Product Architecture Design.md`) → confident match (stop)
   - Edit distance ≤ 3 characters (handles typos, minor renames) → confident match (stop)
   - Multiple candidates at any tier → present all of them (numbered list)

2. **Present to user** using AskUserQuestion:

   _Single confident match:_
   ```
   Broken link: [[Broken Note Name]] (found in N files: "Source A", "Source B")
     Variants: [[Broken Note Name#sec|label1]] in "Source A", [[Broken Note Name]] in "Source B"
   Best match:  [[Actual Note Title]]
   Replace all occurrences? (yes / skip this one / stop)
   ```

   _Multiple candidates:_
   ```
   Broken link: [[Broken Note Name]] (found in N files: "Source A", "Source B")
     Variants: [[Broken Note Name#sec|label1]] in "Source A", [[Broken Note Name]] in "Source B"
   Possible matches:
     1. [[Candidate One]]
     2. [[Candidate Two]]
     3. [[Candidate Three]]
   Enter number to replace all, or (skip this one / stop):
   ```

   Show `Variants:` line only when the same broken link name appears with different `#anchor` or `|display text` combinations across occurrences. Omit it entirely when all occurrences are identical (e.g. all are bare `[[Broken Note Name]]` with no anchor or display text).

   - If **yes** or a number: update all source files that contain this broken link, replacing only the note name portion of each wikilink while **preserving** any `#anchor` and `|display text` (e.g. `[[Broken Name#sec|label]]` → `[[Actual Title#sec|label]]`)
   - If **skip this one**: leave as-is, note as unresolved, continue to next broken link
   - If **stop**: end Pass B immediately, then still emit the Pass B summary report for any fixes already applied before the stop

3. **If no candidates found**: flag as unresolvable — user must fix manually.

4. **Never auto-replace without user confirmation.** Every substitution requires an explicit yes or number.

After Pass B, report:
> Fixed N broken links across M files. P links could not be matched automatically — fix manually.
> Modified files: [list of file paths that were changed]

### Final step

After all fix passes complete (whether or not all passes ran), if Pass A made any changes to MEMORY.md, re-sort the `## Key Learnings & Patterns` section in-place:
1. `[conf:high]` entries first, newest → oldest
2. `[conf:medium]` entries next, newest → oldest
3. `[conf:low]` entries last, newest → oldest
4. Preserve the `<!-- conf:high -->` / `<!-- conf:medium -->` / `<!-- conf:low -->` comment markers as group separators

Then, if `qmd_collection` is set in vault.yml, run:
```bash
qmd update -c [qmd_collection]
```

Do NOT delete any content, modify files outside `[agent_folder]/MEMORY.md` and the files containing broken wikilinks, or restructure vault folders automatically.
