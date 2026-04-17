---
latest_version: 1.10.1
released: 2026-04-18
---

# Changelog

All notable changes to OneBrain are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.10.1] — 2026-04-18

Migration hardening, compact MEMORY.md Identity format, and cross-skill consistency.

**`/update` migration spec:**
- Step 3: explicit rename rules (date prefix, numeric segment, >5 words → kebab-case 3–5 words); INDEX.md wikilinks updated after rename
- Step 4: compact Identity & Personality format — 5-field block replaces verbose 6-field block + redundant bullets; skip-rewrite now checks field labels not just section headings (v1.10.0 vaults with old format now correctly migrate); field-level extraction hints for old-section consolidation; Language field conditional (omit if absent)
- Step 5: exact column spec (`File | Topics | Type | Status | Description`) enforced; existing Description values preserved on rewrite

**`/doctor` improvements:**
- Stale check: now reads `memory/` file frontmatter (`conf:`, `verified:`) instead of MEMORY.md Key Learnings bullets
- Pass A: patches `memory/` file confidence scores directly; removed obsolete Key Learnings re-sort
- New health check: detects old 6-field Identity format (`**Agent name:**`, `**User name:**`) and warns
- New `--fix` pass: rewrites MEMORY.md Identity & Personality to compact format in-place

**`/onboarding`:** Step 9 template updated to compact Identity format (consistent with `/update` Step 4)

**Cross-skill consistency** (stale references to removed sections):
- `INSTRUCTIONS.md`: Phase 1 startup now reads `## Identity & Personality`; agent name extracted from `**Agent:**` field — fixes silent personality fallback after migration
- `/clone`, `/distill`, `/weekly`: updated to reference `memory/` files and `## Identity & Personality` instead of removed MEMORY.md sections

**Checkpoint hook:** sends just `YYYY-MM-DD-checkpoint-NN.md` as reason; fixed glob quoting for iCloud paths with spaces

## [1.10.0] — 2026-04-17

Memory system redesign — per-concept `memory/` file tier, session token isolation, and update channel control.

**New command: `/memory-review`** — interactive pruning of memory files (keep / update / deprecate / delete / archive)

- `memory/` folder replaces MEMORY.md Key Learnings; `INDEX.md` as lazy-load index with per-concept typed frontmatter
- Session token isolation: 6-char token per session stored in context only; concurrent sessions never mix checkpoints (`YYYY-MM-DD-{session_token}-checkpoint-NN.md`)
- Phase 1 startup latency reduced (INDEX.md + token gen deferred after greeting); Phase 2 background tasks run in parallel
- `update_channel` vault.yml field — pull from `stable` / `next` / `N.x` branch; major version bump guard in /update
- MEMORY.md restructured to 3 sections only: Identity & Personality, Active Projects, Critical Behaviors; Key Learnings removed
- /learn: contradiction detection, INDEX.md sync, type inference (5 categories), collision check
- /recap: promotes to `memory/` only (not MEMORY.md); frequency filter (`min_frequency`) and run threshold (`min_sessions`)
- /doctor: 11 new memory health checks; `--fix` rebuilds INDEX.md and auto-renames non-compliant files
- /update: `--dry-run` preview, 8-step vault migration, read-new-execute-in-place bootstrap
- Auto-wrapup removed — Auto Session Summary handles silent saves at session end
- INSTRUCTIONS.md reduced ~456 → ~323 lines; Phase 2, Auto-Summary, QMD extracted to skill files

## [1.9.5] — 2026-04-15

Patch: /update reliability fixes for Windows and cross-platform environments.

## [1.9.3] — 2026-04-15

Phase 2 startup extended with 5 background sub-agents: context pre-loading, stale note scanning, task horizon (next 3 days), MEMORY.md overflow guard, and link suggestion after /learn and /capture. Multiple Phase 2 and briefing edge-case fixes.

## [1.9.0] — 2026-04-15

Memory lifecycle system — confidence scoring, supersession, and /distill.

**New command: `/distill`** — crystallize a completed topic thread into a permanent knowledge note in `03-knowledge/`

**New command: `/doctor`** — vault health check: broken links, orphan notes, stale memory entries, inbox backlog; `--fix` auto-repairs

- Confidence metadata on MEMORY.md Key Learnings: `[conf:high/medium/low]` + `[verified:YYYY-MM-DD]`
- Typed relationship frontmatter (`uses:`, `depends_on:`, `contradicts:`, `supersedes:`, `caused_by:`)
- /learn: contradiction detection — conflict menu (update / supersede / separate)
- /recap: confidence scoring for promoted Key Learnings; auto-sort by confidence tier
- Hardcoded folder paths replaced with config placeholders across all skills and agents

## [1.8.8] — 2026-04-11

Skill routing and checkpoint system hardening.

**New feature: skill routing** — agent auto-invokes skills based on user intent without requiring a slash command

- /wrapup: enforce full checkpoint incorporation before marking merged
- Checkpoint hook: Windows bash compatibility; fixed NN counting for today's checkpoints; removed broken PreCompact hook (Stop-only)
- /tasks: exclude logs, archive, and resources folders from dashboard
- Windows timezone and terminal output fixes (v1.8.9–v1.8.11)

## [1.8.5] — 2026-04-10

Two-phase session startup — greet immediately, background sub-agent handles inbox and orphan checkpoints.

## [1.8.0] — 2026-04-10

Checkpoint system — auto-save session context before compression and on schedule.

- Stop hook: auto-checkpoint every 15 messages or 30 minutes
- /wrapup: merge all unmerged checkpoints before writing session log
- Deferred Obsidian file open via Stop hook (prevents focus-steal)
- /update: inject checkpoint config into `vault.yml`

## [1.7.0] — 2026-04-05

**New capability: /import Office formats** — Word (.docx), PowerPoint (.pptx), Excel (.xlsx) via `markitdown`; lazy-installs on first use

## [1.6.0] — 2026-04-03

New skills and session startup enhancements.

**New command: `/daily`** — daily briefing: tasks due today, overdue tasks, open items from last session

- Time-aware greeting with time-of-day emoji
- Proactive insight from recent session logs at startup
- Command Response Profiles in INSTRUCTIONS.md (verbosity per command type)
- /update refactored to shell script + Windows PowerShell
- /wrapup: "What Worked / What Didn't Work" retrospective section (v1.6.2)
- qmd auto-update after any vault file change (v1.6.1)

## [1.5.7] — 2026-04-03

**New command: `/recap`** — cross-session synthesis: reads session logs, deduplicates insights, promotes Key Learnings to MEMORY.md

## [1.5.6] — 2026-03-28

**New command: `/moc`** — vault portal: create or update MOC.md linking all major vault sections; opens in Obsidian

## [1.5.5] — 2026-03-27

**New command: `/qmd`** — set up and manage qmd semantic search index over vault content

- /tasks fixes: query syntax, keyword quoting, logs exclusion, archive exclusion (v1.5.1–v1.5.4)
- /help: show plugin version; dynamic version badge in README

## [1.5.0] — 2026-03-26

/update: migrate instruction files to `@import` style during update

## [1.4.0] — 2026-03-26

**New command: `/tasks`** — live Obsidian task dashboard (TASKS.md) with keyword filtering; opens in Obsidian after write

## [1.3.0] — 2026-03-25

Dual install: fresh vault and existing vault via plugin marketplace.

## [1.2.x] — 2026-03-25

/update cache improvements; require `AskUserQuestion` for all user input prompts.

## [1.0.0] — 2026-03-21

Initial release.

**Commands:** /onboarding, /braindump, /capture, /bookmark, /consolidate, /connect, /research, /summarize, /import, /reading-notes, /weekly, /wrapup, /learn, /update, /help

- Auto-save session summary on Stop hook
- /onboarding: note-taking method selection; vault folder creation; `vault.yml` generation
- Install scripts for macOS/Linux and Windows
