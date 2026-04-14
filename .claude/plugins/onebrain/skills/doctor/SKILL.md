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

Extract all folder paths and `qmd_collection`. If vault.yml is missing, flag immediately:
> ⛔ vault.yml not found — OneBrain may not be configured correctly.

---

## Step 2: Run Checks

Run all applicable checks based on flags (default: all). Collect findings before reporting.

### Vault Checks (`--vault`)

**Broken wikilinks:**
- Grep all `.md` files in `01-projects/`, `02-areas/`, `03-knowledge/`, `04-resources/`, `05-agent/` for `\[\[.*?\]\]`
- For each wikilink, extract the note name (strip any `|display text` suffix)
- Check if a `.md` file with that exact name exists anywhere in the vault (case-insensitive)
- Flag any that don't resolve; store as: `{ broken_link, source_file, source_line }`

**Orphan notes:**
- Find notes in `03-knowledge/` and `04-resources/` that have no inbound wikilinks from any other note
- These may be disconnected from the knowledge graph
- Report only — no auto-fix (linking requires semantic judgment; use /connect instead)

**Stale MEMORY.md entries:**
- Read `[agent_folder]/MEMORY.md` Key Learnings
- Flag entries where `[verified:YYYY-MM-DD]` is older than 90 days
- Flag entries with no `[verified:...]` tag at all
- Flag entries with `[conf:low]` not updated in 30+ days

**Inbox backlog:**
- Count files in `00-inbox/*.md`
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
- Entries with no `[verified:...]` tag → add `[verified:YYYY-MM-DD]` using the **date prefix from the entry line** (the `YYYY-MM-DD` at the start of each `- YYYY-MM-DD —` bullet); if no date prefix exists, use today's date and note it as estimated

If 0 issues: skip this pass, note "No MEMORY.md issues to fix."

Otherwise, confirm with AskUserQuestion:
> Found N MEMORY.md issues. Apply confidence score fixes?
> - Add missing [conf:medium] baseline to untagged entries
> - Downgrade stale confidence scores
> - Add missing [verified:...] dates from entry date prefixes

### Pass B: Broken wikilink fuzzy-fix

For each broken wikilink found in Step 2:

1. **Fuzzy-match candidates:** Search all `.md` filenames in the vault for names that are similar to the broken link name. Similarity heuristics (apply in order, stop at first confident match):
   - Case-insensitive exact match
   - One is a substring of the other (e.g. `[[OneBrain v2]]` → `OneBrain v2.0.0 Product Architecture Design.md`)
   - Edit distance ≤ 3 characters (handles typos, minor renames)

2. **If a confident match is found**, show it to the user using AskUserQuestion:
   ```
   Broken link: [[Broken Note Name]] in "Source Note"
   Best match:  [[Actual Note Title]]
   Replace? (yes / no / skip all)
   ```
   - If **yes**: update the source file, replacing `[[Broken Note Name]]` with `[[Actual Note Title]]`
   - If **no**: leave as-is, note as unresolved
   - If **skip all**: stop fuzzy-fix pass entirely

3. **If no confident match is found**: flag as unresolvable — user must fix manually.

4. **Never auto-replace without user confirmation.** Every substitution requires an explicit yes.

After Pass B, report:
> Fixed N broken links. M links could not be matched automatically — fix manually.

### Final step

After both passes complete, if `qmd_collection` is set in vault.yml, run:
```bash
qmd update -c [qmd_collection]
```

Do NOT delete any content, modify files outside `[agent_folder]/MEMORY.md` and the files containing broken wikilinks, or restructure vault folders automatically.
