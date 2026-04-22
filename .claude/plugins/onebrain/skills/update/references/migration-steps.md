# Vault Migration Steps

Run these steps IN ORDER. Halt on first failure — do not continue.
Each step lists a **Skip condition** — check it first before doing any file reads.

**Step 1: Migrate MEMORY.md Key Learnings → memory/** (MUST run before Step 4)
- **Skip if:** MEMORY.md contains neither `## Key Learnings` nor `## Key Decisions` section
- Read `## Key Learnings` and `## Key Decisions` from MEMORY.md
- Tool behaviors (bash tricks, RTK, draw.io, cron patterns) → delete, do not migrate
- Genuine behavioral patterns → write to memory/ (type: behavioral, source: /update, conf: medium, created: today, verified: today, updated: today)
- Key Decisions → write to memory/ (type: project, source: /update)

**Step 2: Migrate context/ → memory/**
- **Skip if:** `[agent_folder]/context/` folder does not exist
- For each file in `[agent_folder]/context/`: rename to kebab-case, move to memory/
- Add frontmatter: type: context, source: /update, conf: medium, created: (preserve if exists else today), verified: today, updated: today, topics: [2–4 keywords from content]
- Delete context/ folder after all files migrated

**Step 3: Update existing memory/ files**
- **Skip if:** sample the first 5 files alphabetically in memory/ — if all 5 have all required frontmatter fields (topics, type, conf, verified, updated) and kebab-case 3–5 word filenames with no date/numeric prefix, skip the step. If any of the 5 fail, process all files.
- Add missing frontmatter fields: topics, type, conf, verified, updated
- Rename non-compliant files → kebab-case 3–5 words. A file is non-compliant if it has:
  - A date prefix (e.g. `2026-04-05-bump-version-every-pr.md` → `bump-version-pr.md`)
  - A numeric segment prefix (e.g. `2026-04-05-02-superpowers-docs-in-vault.md` → `superpowers-docs-vault.md`)
  - Title-Case or spaces in the filename
  - More than 5 words (strip stop words; keep the meaningful 3–5)
- After renaming: update all `[[wikilinks]]` in `[agent_folder]/MEMORY-INDEX.md` and any `supersedes:`/`superseded_by:` references to use the new filename
- Compliant example: `bump-version-pr.md`, `dev-workflow-worktree.md`, `telegram-format.md`

**Step 4: Restructure MEMORY.md** (MUST run after Step 1)
- **Skip if:** MEMORY.md already uses compact Identity labels (`**Agent:**`, `**User:**`, `**Tone:**`) — only update the `updated:` frontmatter field in this case
- If the old 6-field labels are present (`**Agent name:**`, `**User name:**`, etc.), rewrite even if the 3 section headings already exist. Always update `updated:` frontmatter.

Target structure — exactly 3 sections:

```markdown
## Identity & Personality

**Agent:** [name] · [gender/pronoun rules if set]
**Personality:** [personality description]
**User:** [user_name] · [role]
**Tone:** [tone] · [detail_level]
**Language:** [language rules — omit this line if no language rules are set]

You are [agent_name], [user_name]'s personal chief of staff inside their Obsidian vault.

- Priority goal: [primary goal]
- Proactive: surface connections, flag stale items, suggest next steps
- Ground responses in vault — reference actual notes when relevant
- [AskUserQuestion or tool-use preferences, if set]

## Active Projects

<!-- Updated by /consolidate and /braindump -->
- **[Project]** — [status emoji + label]. [description].

## Critical Behaviors

- [behavioral item]
<!-- Add behavioral preferences here via /learn -->
```

Old-section mapping (apply when migrating from pre-v1.10.0 structure):
- `## Agent Identity` + `## Identity` + `## Communication Style` + `## Goals & Focus Areas` + `## Values & Working Principles` + `## AI Personality Instructions` → consolidate into `## Identity & Personality`
- `## Active Projects` → keep as-is
- `## Critical Behaviors` → preserve if present; if absent, create with items from `## Values & Working Principles` plus an empty comment; remove any auto-wrapup trigger entry if present (auto-wrapup is now handled by AUTO-SUMMARY.md)
- Remove entirely: `## Key Learnings`, `## Key Decisions`, `## Recurring Contexts`

Field extraction hints (for old-section consolidation):
- **Agent:** → name from `## Agent Identity` or `## Identity`; gender/pronoun rules from `## AI Personality Instructions` if present; omit gender/pronoun suffix if absent
- **Personality:** → archetype + description from `## AI Personality Instructions` or `## Communication Style`
- **User:** → name from `## Agent Identity`; role from `## Agent Identity` or `## Goals & Focus Areas`
- **Tone:** → tone + detail_level from `## Communication Style`
- **Language:** → language rules from `## Communication Style` or `## Agent Identity` if present; omit line entirely if absent
- Priority goal bullet → first entry from `## Goals & Focus Areas`
- `## Values & Working Principles` items → `## Critical Behaviors` (only if Critical Behaviors was absent)

Always: update `updated:` frontmatter to today.

**Step 5: Create `[agent_folder]/MEMORY-INDEX.md`**
- **Skip if:** MEMORY-INDEX.md exists, has correct column format (`| File | Topics | Type | Status | Description |`), and `total_active` count matches the actual number of `status: active` files in memory/
- Read frontmatter of all files in `[agent_folder]/memory/` (batch 20 at a time if >50 files)
- Include only status: active and status: needs-review in table
- Column format (exact order): `| File | Topics | Type | Status | Description |`
  - **File**: wikilink `[[filename-without-extension]]`
  - **Topics**: comma-separated topics from frontmatter
  - **Type**: from frontmatter (behavioral / project / context)
  - **Status**: from frontmatter (active / needs-review)
  - **Description**: 1-line summary derived from file content (not from frontmatter)
- For each file with supersedes: X, set superseded_by: [this file] on X's frontmatter
- Set cache fields: total_active, total_needs_review (omit last_review)
- If MEMORY-INDEX.md already exists but has wrong column order or missing Description column → rewrite with correct format; preserve existing Description values from old rows (map by filename) rather than regenerating from scratch

**Step 6: Backfill recapped: on existing session logs**
- **Skip if:** `[logs_folder]/` does not exist
- Run `bash ".claude/plugins/onebrain/skills/update/scripts/backfill-recapped.sh" "[logs_folder]"` — adds `recapped: YYYY-MM-DD` to session logs that don't have it; idempotent
- **Note:** This marks all pre-migration logs as recapped so /recap does not reprocess them. Historical patterns were already in MEMORY.md Key Learnings (now migrated to memory/ in Step 1). If the user wishes to retroactively promote insights from a specific old log, they can clear its `recapped:` field before running /recap.

**Step 7: Register OneBrain hooks in `[vault]/.claude/settings.json`**

Runs every /update — idempotent. Ensures all 3 hooks point to the correct script.

- Run `bash ".claude/plugins/onebrain/skills/update/scripts/register-hooks.sh" ".claude/settings.json"` — registers Stop, PreCompact, PostCompact hooks; never removes user-added hooks in the same event key
- Check output: "all hooks already registered" → ✅ done; "added X" → ✅ registered

**PostToolUse qmd hook (only when `qmd_collection` is set in vault.yml):**
- If `qmd_collection` is absent in vault.yml: skip
- If `qmd_collection` is present: read `[vault]/.claude/plugins/onebrain/hooks/hooks.json`
  - If missing or `PostToolUse` entry does not contain `qmd-reindex.sh`: the file was already synced in bootstrap step 3b (vault-sync.sh) — re-verify the sync completed successfully and flag the issue
  - If correct: ✅ PostToolUse qmd hook registered

**Step 8: Verify migration**
- Run /doctor (newly-synced version) automatically
- Expected: 0 orphans, 0 dead links, 0 non-compliant names, MEMORY-INDEX.md present
- If any check fails: surface to user with suggestion to run /doctor --fix

**Step 9: Initialize vault.yml stats + recap block**
- **Skip if:** vault.yml already has both `stats:` and `recap:` blocks
- Add stats: block: set last_doctor_run to today; leave last_memory_review and last_recap absent (written on first use)
- Add recap: block: min_sessions: 6, min_frequency: 2
- Skip if vault.yml doesn't exist or user opted out via --skip-stats
