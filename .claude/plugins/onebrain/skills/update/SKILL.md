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
3. Read new version from repo's `plugin.json` on the mapped branch (not always main)
4. If equal → "Already up to date vX.X.X" and stop
5. If newer → read `CHANGELOG.md` from repo; display release notes in user's language

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
   a. Pre-migration backup: copy `05-agent/MEMORY.md` → `06-archive/05-agent/MEMORY.md.YYYY-MM-DD.bak`
      and `05-agent/context/` → `06-archive/05-agent/context.YYYY-MM-DD/` (if context/ exists)
   b. Sync skill files first: skills/startup/, skills/memory-review/, skills/doctor/,
      skills/learn/, skills/recap/, skills/wrapup/, skills/clone/, skills/onboarding/, skills/update/
   c. Run vault migration steps 1–8 (using newly-synced skill logic)
   d. Run /doctor verification (newly-synced /doctor with new checks)
   e. Sync remaining repo files: INSTRUCTIONS.md, README.md, CONTRIBUTING.md, CHANGELOG.md
   f. Bump plugin.json version (last — completion signal)
5. Write migration log to `07-logs/YYYY/MM/YYYY-MM-DD-update-vX.X.X.md`
6. Report summary to user

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
- Rename non-compliant files (date prefix, Title-Case, >5 words) → kebab-case 3–5 words

**Step 4: Restructure MEMORY.md** (MUST run after Step 1)
- Remove ## Key Learnings, ## Key Decisions, ## Recurring Contexts sections entirely
- Keep ## Identity & Personality, ## Active Projects, ## Critical Behaviors (preserve user items)
- Remove any auto-wrapup trigger entry from Critical Behaviors if present
- Update `updated:` frontmatter to today

**Step 5: Create INDEX.md**
- Read frontmatter of all files in memory/ (batch 20 at a time if >50 files)
- Include only status: active and status: needs-review in table
- For each file with supersedes: X, set superseded_by: [this file] on X's frontmatter
- Set cache fields: total_active, total_needs_review (omit last_review)

**Step 6: Backfill recapped: on existing session logs**
- If 07-logs/ doesn't exist → skip
- Glob 07-logs/**/*-session-*.md
- For each: read date: frontmatter → set recapped: YYYY-MM-DD using that same date
- Fallback: if date: missing, parse YYYY-MM-DD prefix from filename
- **Note:** This marks all pre-migration logs as recapped so /recap does not reprocess them. Historical patterns were already in MEMORY.md Key Learnings (now migrated to memory/ in Step 1). If the user wishes to retroactively promote insights from a specific old log, they can clear its `recapped:` field before running /recap.

**Step 7: Verify migration**
- Run /doctor (newly-synced version) automatically
- Expected: 0 orphans, 0 dead links, 0 non-compliant names, INDEX.md present
- If any check fails: surface to user with suggestion to run /doctor --fix

**Step 8: Initialize vault.yml stats + recap block**
- Add stats: block: set last_doctor_run to today; leave other fields absent
- Add recap: block: min_sessions: 6, min_frequency: 2
- Skip if vault.yml doesn't exist or user opted out via --skip-stats

## --dry-run Mode

`/update --dry-run` → run all steps WITHOUT writing. For each migration step, output:
```
[Step N] Would create: [logs_folder]/YYYY/MM/YYYY-MM-DD-update-vX.X.X.md
[Step N] Would modify: [agent_folder]/MEMORY.md — remove Key Learnings section
[Step N] Would create: [agent_folder]/memory/kebab-topic.md
[Step N] Would delete: [agent_folder]/context/
```
The version check, changelog display, and AskUserQuestion confirmation still happen normally in dry-run mode. No files are written, moved, or deleted. At the end, print a summary: "Dry run complete — N files would be created, M modified, P deleted."

## Failure Recovery

- Version stays old until plugin.json bump (step 4f) — re-running /update retries from start
- Already-synced files are idempotent (compare content before overwriting)
- If vault in unrecoverable state: restore from backup in 06-archive/, then re-run /update
