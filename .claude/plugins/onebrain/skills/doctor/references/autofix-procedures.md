# Auto-Fix Procedures — Reference

Invoked by `/doctor --fix` flag only. Each pass confirms with the user before writing.

---

## Pass A: Pin plugin to vault

Fixes: Plugin `installPath` pointing to user cache instead of vault directory.
Applies when: /doctor Config check shows 🔴 "Plugin loading from user cache"

Run in order (sequential — pin first, then clear cache):
```bash
bash ".claude/plugins/onebrain/skills/update/scripts/pin-to-vault.sh" "$PWD"
bash ".claude/plugins/onebrain/skills/update/scripts/clean-plugin-cache.sh"
```

After running: prompt the user to run `/reload-plugins` to apply.

---

## Pass B: memory/ confidence scores

Collect auto-fixable issues from the stale memory/ files scan:
- `conf: high` files with `verified:` older than 90 days → downgrade to `conf: medium`
- `conf: medium` files with `verified:` older than 180 days → downgrade to `conf: low`
- Files with no `conf:` field → add `conf: medium` as baseline, then apply staleness rules above
- Files with no `verified:` field → flag for manual review (do not assign today's date — would reset the staleness clock)

If 0 issues: skip this pass, note "No memory/ confidence issues to fix."

Otherwise, confirm with AskUserQuestion (if user declines, skip this pass — no changes written):
> Found N memory/ confidence issues. Apply fixes?
> - Add missing conf: medium baseline to files with no conf field
> - Downgrade stale confidence scores
> - Flag files with no verified: date for manual review — these will NOT be auto-fixed

After applying auto-fixes, list any files flagged for manual review:
> ⚠️ Needs manual review (no verified: date):
> > `memory/filename.md`

---

## Pass C: Broken wikilink fuzzy-fix

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
   - If **stop**: end Pass C immediately, then still emit the Pass C summary report for any fixes already applied before the stop

3. **If no candidates found**: flag as unresolvable — user must fix manually.

4. **Never auto-replace without user confirmation.** Every substitution requires an explicit yes or number. **Why:** Wikilink names may be intentionally different — an alias, a display override, or a reference to a planned-but-not-yet-created note. Silent replacement could rename concepts across the vault in ways that are correct syntactically but wrong semantically.

After Pass C, report:
✅ Fixed {N} broken links across {M} files.
🟡 {N} links could not be auto-matched — manual review needed.
Modified files: [list of file paths that were changed]

---

## Pass D: Deprecated vault.yml keys

If `timezone` key was found in vault.yml (from Step 2 config check): confirm with AskUserQuestion:
> `timezone` in vault.yml is no longer used — the agent now uses local machine time. Remove it?

If **yes**: remove the `timezone` line from vault.yml. If **no**: leave as-is.

If `timezone` was not found: skip this pass, note "No deprecated keys to clean up."

---

## Final step

After all fix passes complete, if any files were written to disk (Pass A or Pass B made confirmed changes — Pass D edits vault.yml which is not indexed by qmd):
```bash
bash ".claude/plugins/onebrain/startup/scripts/qmd-update.sh"
```

Do NOT delete any content, modify files outside `[agent_folder]/MEMORY.md` and the files containing broken wikilinks, or restructure vault folders automatically.

---

## Ongoing Maintenance (`/doctor --fix`)

These procedures run during `/doctor --fix` for issues that arise after initial setup (not migration):

**1. Rebuild MEMORY-INDEX.md** from scratch:
   - Read frontmatter of all files in `memory/`
   - Skip files with `status: deprecated` (not in MEMORY-INDEX by design)
   - Rebuild table with active and needs-review entries only
   - Recalculate `total_active`, `total_needs_review`
   - Set `updated:` to today

**2. Auto-rename non-compliant memory files:**
   - kebab-case (lowercase, hyphens only)
   - No date prefix (e.g. `YYYY-MM-DD-topic.md` → `topic.md`)
   - 3–5 words
   - Update MEMORY-INDEX.md wikilinks to match renamed files

**3. Reset `recap.min_frequency`** to `2` if invalid value found in vault.yml.

**4. Rewrite MEMORY.md Identity & Personality to compact format:**
   - Trigger: old 6-field labels detected (`**Agent name:**`, `**User name:**`, etc.)
   - Confirm with AskUserQuestion: "MEMORY.md has pre-v1.10.1 Identity format. Rewrite to compact format?" Options: `yes / no`
   - If yes: apply same migration as /update Step 4 — extract field values using extraction hints, write compact block, preserve all other sections unchanged

Update `vault.yml` `stats.last_doctor_fix: YYYY-MM-DD` on completion.
