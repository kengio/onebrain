---
name: update
description: "Update OneBrain system files from the source repo to the latest version"
---

# /update

Update OneBrain system files from the source repo to the latest version.

## Version Check

1. Read current version from vault's `plugin.json` (`[agent_folder]/../../.claude-plugin/plugin.json` or `.claude/plugins/onebrain/.claude-plugin/plugin.json`)
2. Read `update_channel` from `vault.yml` (default: `stable` if field absent).
   Map to GitHub branch:
   - `stable` → `main`
   - `next` → `next`
   - `N.x` (e.g. `1.x`, `2.x`) → `N.x`
3. Read new version from repo's `plugin.json` on the mapped branch using `WebFetch` — never use `git` commands (they hang on Windows waiting for credentials):
   `https://raw.githubusercontent.com/kengio/onebrain/{branch}/.claude/plugins/onebrain/.claude-plugin/plugin.json`
   where `{branch}` is the mapped branch from step 2.
   Parse the `version` field from the JSON response.
4. If equal → say: ✅ Already up to date — v{X.X.X}. and stop
5. If newer → read `CHANGELOG.md` from repo; display before proceeding (do not skip or summarize):
   ──────────────────────────────────────────────────────────────
   🔄 Update Available — v{current} → v{new}
   ──────────────────────────────────────────────────────────────
   {changelog entry verbatim}

   Then AskUserQuestion: "Update to v{new}?" Options: update / cancel

### Major Version Bump Guard

If `new_major > current_major` (e.g. vault is v1.10.0, repo branch has v2.0.0):
→ AskUserQuestion: "Major version bump detected (v{current} → v{new}) — this may include breaking changes. Proceed with update?"
Options: `update / cancel`
→ If cancel: stop immediately, no changes made
→ If update: proceed with normal confirmation flow below

Minor/patch bumps (1.10.0 → 1.10.1, 1.10.0 → 1.11.0): proceed without major version prompt.

6. AskUserQuestion: "Update to vX.X.X?"
   Options: `update / cancel`
7. If confirmed → proceed to bootstrap below

## Self-Update Bootstrap (Read-New, Execute-In-Place)

Skills are markdown instructions — the agent can read the new SKILL.md from the repo and
follow it as instructions in the same conversation. No re-invoke needed.

Steps:
1. Read repo's `skills/update/SKILL.md` content into agent context
2. Read repo's CHANGELOG.md to identify migration steps for current version
3. Follow the NEW SKILL.md instructions (not the vault's old copy)
4. Execute migration in this order:
   a. Pre-migration backup: copy `05-agent/MEMORY.md` → `06-archive/05-agent/MEMORY-YYYY-MM-DD.md`
      and `05-agent/context/` → `06-archive/05-agent/context.YYYY-MM-DD/` (if context/ exists)
   b. Sync plugin folder: copy everything under `.claude/plugins/onebrain/` from source repo to vault, overwriting existing files. Skip `plugin.json` — it is written last as the completion signal. The plugin folder is source of truth; user customizations belong at project or user level.

   c. Merge `[vault]/.claude/settings.json` from repo's `.claude/settings.json` — the repo is the source of truth for base permissions and plugin config. Merge strategy (never overwrite, always additive):
      - `permissions.allow`: union — add any entries from repo not already in vault's list
      - `enabledPlugins`: merge — add any keys from repo not already in vault's object
      - `extraKnownMarketplaces`: merge — add any keys from repo not already in vault's object
      - `hooks`: skip — handled separately by Step 7

   d. Run vault migration steps 1–9 (using newly-synced skill logic)
   e. Run /doctor verification (newly-synced /doctor with new checks)
   f. Sync remaining repo files: INSTRUCTIONS.md, README.md, CONTRIBUTING.md, CHANGELOG.md
   g. Bump plugin.json version (last — completion signal)
5. Write migration log to `[logs_folder]/YYYY/MM/YYYY-MM-DD-update-vX.X.X.md`:

   ```markdown
   ---
   tags: [update-log]
   date: YYYY-MM-DD
   from_version: X.X.X
   to_version: X.X.X
   ---

   # Update Log — vX.X.X → vX.X.X

   ## Steps Completed

   - [x] Step 1: Migrated N Key Learnings → memory/ (N behavioral, N project)
   - [x] Step 2: Migrated context/ → memory/ (N files)
   - [x] Step 3: Updated frontmatter on N memory/ files
   - [x] Step 4: Restructured MEMORY.md → 3 sections
   - [x] Step 5: Created MEMORY-INDEX.md (N active entries)
   - [x] Step 6: Backfilled recapped: on N session logs
   - [x] Step 7: Registered Stop/PreCompact/PostCompact hooks in [vault]/.claude/settings.json
   - [x] Step 8: /doctor — N issues
   - [x] Step 9: Initialized vault.yml stats + recap block

   ## Summary

   N files created, N modified, N deleted.
   ```

   - Mark each step `[x]` on completion; leave `[ ]` if skipped (with reason)
   - If a step had nothing to do (e.g. context/ already absent), write `[x] Step 2: Skipped — context/ not present`
   - If /doctor found issues in Step 8, list them under the step line

6. Report summary to user:

   For each migration step (one line per step):
   ✅ Step {N}: {description} ({N} files)
   ✅ Step {N}: Skipped — {reason}
   🟡 Step {N}: {description} — {N} issues (see above)

   Completion:
   ✅ OneBrain updated to v{new}. {N} files created, {M} modified.

## Vault Migration Steps

Run these steps IN ORDER. Halt on first failure — do not continue.

**Step 1: Migrate MEMORY.md Key Learnings → memory/** (MUST run before Step 4)
- Read ## Key Learnings and ## Key Decisions from MEMORY.md
- Tool behaviors (bash tricks, RTK, draw.io, cron patterns) → delete, do not migrate
- Genuine behavioral patterns → write to memory/ (type: behavioral, source: /update, conf: medium, created: today, verified: today, updated: today)
- Key Decisions → write to memory/ (type: project, source: /update)

**Step 2: Migrate context/ → memory/**
- For each file in 05-agent/context/: rename to kebab-case, move to memory/
- Add frontmatter: type: context, source: /update, conf: medium, created: (preserve if exists else today), verified: today, updated: today, topics: [2–4 keywords from content]
- Delete context/ folder after all files migrated

**Step 3: Update existing memory/ files**
- Add missing frontmatter fields: topics, type, conf, verified, updated
- Rename non-compliant files → kebab-case 3–5 words. A file is non-compliant if it has:
  - A date prefix (e.g. `2026-04-05-bump-version-every-pr.md` → `bump-version-pr.md`)
  - A numeric segment prefix (e.g. `2026-04-05-02-superpowers-docs-in-vault.md` → `superpowers-docs-vault.md`)
  - Title-Case or spaces in the filename
  - More than 5 words (strip stop words; keep the meaningful 3–5)
- After renaming: update all `[[wikilinks]]` in `[agent_folder]/MEMORY-INDEX.md` and any `supersedes:`/`superseded_by:` references to use the new filename
- Compliant example: `bump-version-pr.md`, `dev-workflow-worktree.md`, `telegram-format.md`

**Step 4: Restructure MEMORY.md** (MUST run after Step 1)

Target structure — exactly 3 sections. Skip rewrite only if MEMORY.md already uses the compact Identity labels (`**Agent:**`, `**User:**`, `**Tone:**`). If the old 6-field labels are present (`**Agent name:**`, `**User name:**`, etc.), rewrite even if the 3 section headings already exist. Always update `updated:` frontmatter.

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
- If 07-logs/ doesn't exist → skip
- Glob 07-logs/**/*-session-*.md
- For each: read date: frontmatter → set recapped: YYYY-MM-DD using that same date
- Fallback: if date: missing, parse YYYY-MM-DD prefix from filename
- **Note:** This marks all pre-migration logs as recapped so /recap does not reprocess them. Historical patterns were already in MEMORY.md Key Learnings (now migrated to memory/ in Step 1). If the user wishes to retroactively promote insights from a specific old log, they can clear its `recapped:` field before running /recap.

**Step 7: Register OneBrain hooks in `[vault]/.claude/settings.json`**

Runs every /update — idempotent. Ensures all 3 hooks point to the correct script.

- Read `[vault]/.claude/settings.json` (vault-level file, not `~/.claude/settings.json`)
- For each hook below: check if the entry exists under that event key AND its command contains `checkpoint-hook.sh` with the correct mode. Add or replace if absent or wrong. Leave all other hook entries (PreToolUse, PostToolUse, etc.) untouched.

  | Event | Command |
  |-------|---------|
  | `Stop` | `bash ".claude/plugins/onebrain/hooks/checkpoint-hook.sh" stop` |
  | `PreCompact` | `bash ".claude/plugins/onebrain/hooks/checkpoint-hook.sh" precompact` |
  | `PostCompact` | `bash ".claude/plugins/onebrain/hooks/checkpoint-hook.sh" postcompact` |

  Use the same JSON structure as the existing Stop entry in the file.

**Hook registration algorithm (additive):** For each event key in the table above:
1. Read the existing array under that key (treat missing or null as empty array)
2. Scan for an entry whose `command` contains `checkpoint-hook.sh` (the command is nested: `entry.hooks[N].command`)
3. If found: replace just that entry with the correct command; leave all other entries in the array untouched
4. If not found: append the new entry to the array
Never replace the entire array — user-added hooks in the same event key must be preserved.

**PostToolUse qmd hook (only when `qmd_collection` is set in vault.yml):**
- If `qmd_collection` is absent in vault.yml: skip
- If `qmd_collection` is present: read `[vault]/.claude/plugins/onebrain/hooks/hooks.json`
  - If missing or `PostToolUse` entry does not contain `qmd-reindex.sh`: the file was already synced in Step 4b — re-verify the sync completed successfully and flag the issue
  - If correct: ✅ PostToolUse qmd hook registered

**Step 8: Verify migration**
- Run /doctor (newly-synced version) automatically
- Expected: 0 orphans, 0 dead links, 0 non-compliant names, MEMORY-INDEX.md present
- If any check fails: surface to user with suggestion to run /doctor --fix

**Step 9: Initialize vault.yml stats + recap block**
- Add stats: block: set last_doctor_run to today; leave last_memory_review and last_recap absent (written on first use)
- Add recap: block: min_sessions: 6, min_frequency: 2
- Skip if vault.yml doesn't exist or user opted out via --skip-stats

## --dry-run Mode

`/update --dry-run` → run all steps WITHOUT writing. Display for each step:
```
──────────────────────────────────────────────────────────────
🔄 Dry Run — v{current} → v{new}
──────────────────────────────────────────────────────────────
Would create: `[logs_folder]/YYYY/MM/YYYY-MM-DD-update-vX.X.X.md`
Would modify: `[agent_folder]/MEMORY.md` — remove Key Learnings section
Would create: `[agent_folder]/memory/kebab-topic.md`
Would delete: `[agent_folder]/context/`
```
The version check, changelog display, and AskUserQuestion confirmation still happen normally in dry-run mode. No files are written, moved, or deleted. At the end say:
Dry run complete — {N} files would be created, {M} modified, {P} deleted.

## Failure Recovery

- Version stays old until plugin.json bump (step 4g) — re-running /update retries from start
- Already-synced files are idempotent (compare content before overwriting)
- If vault in unrecoverable state: restore from backup in 06-archive/, then re-run /update
