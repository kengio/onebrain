---
name: doctor
description: "Diagnose vault and plugin health — checks broken links, orphan notes, stale MEMORY.md entries, inbox backlog, and plugin config validity"
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

Read `vault.yml`. If it is missing, flag immediately:
> ⛔ vault.yml not found — OneBrain may not be configured correctly.

---

## Step 2: Run Checks

Run all applicable checks based on flags (default: all). Collect findings before reporting.

### Vault Checks (`--vault`)

**Broken wikilinks:**
- Grep all `.md` files in `[projects_folder]/`, `[areas_folder]/`, `[knowledge_folder]/`, `[resources_folder]/`, `[agent_folder]/` for `\[\[.*?\]\]`
- **Skip** wikilinks found inside fenced code blocks (between ` ``` ` fences), blockquote lines (lines beginning with `>`), or inline code spans (the entire `[[...]]` is enclosed within backticks on that line)
- For each wikilink, extract the note name: strip any `|display text` suffix **and** any `#anchor` fragment (e.g. `[[Note#section|label]]` → match name is `Note`; preserve full original text for display)
- Check if a `.md` file with that exact name exists anywhere in the vault (case-insensitive)
- Flag any that don't resolve; store as: `{ broken_link, display_text, anchor, source_file, source_line }` (preserving all parts for accurate replacement later)

**Orphan notes:**
- Find notes in `[knowledge_folder]/` and `[resources_folder]/` that have no inbound wikilinks from any other note
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
- Check `qmd_collection` is present (warn if absent — qmd search won't work)
- Check if `timezone` key is present — it is no longer used; warn the user to remove it

**plugin.json:**
- Read `.claude/plugins/onebrain/.claude-plugin/plugin.json`
- Verify `name`, `version`, `description` fields exist and are non-empty

**INSTRUCTIONS.md:**
- Check file exists at `.claude/plugins/onebrain/INSTRUCTIONS.md`
- Check `skills/startup/PHASE2.md` exists — if missing: 🔴 "PHASE2.md not found — Phase 2 startup will be skipped; run /update to restore"
- Check `skills/startup/AUTO-SUMMARY.md` exists — if missing: 🔴 "AUTO-SUMMARY.md not found — auto session summary disabled; run /update to restore"

**vault.yml recap block:**
- Check `recap:` block is present in vault.yml
- If absent: 🟡 "`recap:` block missing from vault.yml — /recap will use defaults (min_sessions: 6, min_frequency: 2); run /update to add it"

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
🟡 vault.yml: `timezone` key found — no longer used, safe to remove

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

Run all fix passes. Each pass confirms with the user before writing.

### Pass A: MEMORY.md confidence scores

Collect auto-fixable issues from the Key Learnings scan:
- `[conf:high]` entries not verified in 90+ days → downgrade to `[conf:medium]`
- `[conf:medium]` entries not verified in 180+ days → downgrade to `[conf:low]`
- Entries with no `[conf:...]` tag → add `[conf:medium]` as baseline, then apply staleness rules above
- Entries with no `[verified:...]` tag → add `[verified:YYYY-MM-DD]` using the **date prefix from the entry line** (the `YYYY-MM-DD` at the start of each `- YYYY-MM-DD —` bullet); if no date prefix exists, treat the entry as maximally stale — flag it as requiring manual review rather than assigning today's date (assigning today would incorrectly reset the staleness clock)

If 0 issues: skip this pass, note "No MEMORY.md issues to fix."

Otherwise, confirm with AskUserQuestion (if user declines, skip this pass — no changes written):
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

### Pass C: Deprecated vault.yml keys

If `timezone` key was found in vault.yml (from Step 2 config check): confirm with AskUserQuestion:
> `timezone` in vault.yml is no longer used — the agent now uses local machine time. Remove it?

If **yes**: remove the `timezone` line from vault.yml. If **no**: leave as-is.

If `timezone` was not found: skip this pass, note "No deprecated keys to clean up."

### Final step

After all fix passes complete (whether or not all passes ran), if Pass A actually wrote changes to MEMORY.md (i.e., user confirmed and fixes were applied — not skipped or declined), re-sort the `## Key Learnings & Patterns` section in-place:
1. `[conf:high]` entries first, newest → oldest
2. `[conf:medium]` entries next, newest → oldest
3. `[conf:low]` entries last, newest → oldest
4. Preserve each `<!-- conf:* ... -->` comment line exactly as-is (the markers may have additional text after the tier name, e.g. `<!-- conf:high — empirically confirmed -->`); do not strip or rewrite them
5. If a conf group has no entries, omit that group's comment marker entirely rather than leaving an empty section
6. Entries with no `[conf:...]` tag: treat as `[conf:medium]` for sorting purposes only (do not add a tag)

Then, if any files were written to disk (Pass A or Pass B made confirmed changes — Pass C edits vault.yml, which is not a markdown note and is not indexed by qmd), and `qmd_collection` is set in vault.yml, run:
```bash
qmd update -c [qmd_collection]
```

Do NOT delete any content, modify files outside `[agent_folder]/MEMORY.md` and the files containing broken wikilinks, or restructure vault folders automatically.

---

## Memory Health Checks

| Check | Action |
|---|---|
| INDEX.md missing | AskUserQuestion: "INDEX.md not found — create an empty one?" `yes / no` |
| Files in memory/ not in INDEX.md | Read frontmatter; skip `status: deprecated`; list remaining as orphans |
| Rows in INDEX.md pointing to missing files | List dead links |
| Files with `verified` > 90 days | Check active/needs-review only (skip deprecated); auto-set `status: needs-review` in file and INDEX.md |
| Critical Behaviors section > 15 items | Warn: suggest moving excess to memory/ |
| Checkpoint files with `merged: true` | Delete them (safety net — /wrapup handles these, /doctor catches stragglers) |
| Checkpoint files > 14 days old with no session log | AskUserQuestion: "Found {N} checkpoints >14 days old with no session log — delete all?" `delete-all / show-list / skip` |
| memory/ files with non-compliant names | List offenders (not kebab-case, has date prefix, or >5 words); `--fix` auto-renames |
| memory/ files with non-default `type` AND not used by 2+ files | Warn possible typo; suggest nearest default via Levenshtein distance ≤2 |
| `recapped` date in the future (>today) | Warn — likely manual mistake; suggest correcting |
| `vault.yml` `recap.min_frequency` < 2 or non-integer | Warn invalid config; `--fix` resets to default 2 |
| `vault.yml` `update_channel` invalid value | Warn: must be `stable`, `next`, or `N.x` pattern (e.g. `1.x`); suggest correcting or removing the field to use default (`stable`) |

---

## /doctor --fix

Ongoing maintenance only (not migration). Fixes issues arising after initial setup:

1. **Rebuild INDEX.md** from scratch:
   - Read frontmatter of all files in `memory/`
   - Skip files with `status: deprecated` (not in INDEX by design)
   - Rebuild table with active and needs-review entries only
   - Recalculate `total_active`, `total_needs_review`
   - Set `updated:` to today

2. **Auto-rename non-compliant memory files:**
   - kebab-case (lowercase, hyphens only)
   - No date prefix (e.g. `YYYY-MM-DD-topic.md` → `topic.md`)
   - 3–5 words
   - Update INDEX.md wikilinks to match renamed files

3. **Reset `recap.min_frequency`** to `2` if invalid value found in vault.yml.

Update `vault.yml` `stats.last_doctor_fix: YYYY-MM-DD` on completion.

---

## Migration Safety Net

If `05-agent/context/` still exists:
→ warn: "context/ folder found — /update migration may not have run yet"
→ AskUserQuestion: "Migrate all files into memory/?" `migrate / skip`
→ This check catches edge cases only — the full migration runs via /update

---

## On Completion

Update `vault.yml` `stats.last_doctor_run: YYYY-MM-DD`.
If `--fix` was run: also update `stats.last_doctor_fix: YYYY-MM-DD`.
