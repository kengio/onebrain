---
latest_version: 1.10.0
released: 2026-04-17
---

# Changelog

All notable changes to OneBrain are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.10.0] — 2026-04-17

Memory system redesign — replaces MEMORY.md Key Learnings with a structured `memory/` file tier, adds session isolation for concurrent sessions, and introduces update channel control.

### Added

**Memory tier system**
- `memory/` folder — per-concept markdown files replacing MEMORY.md Key Learnings
- `INDEX.md` — lazy-load index for all memory/ files; loaded every session alongside MEMORY.md
- `/memory-review` — interactive memory pruning skill with 7 options (keep/update/needs-review/deprecate/delete/skip/stop); soft delete to `[archive_folder]/[agent_folder]/memory/YYYY-MM/`
- Per-turn relevance check — agent loads memory files matching session topic mid-conversation
- Memory injection fence (`<memory-context>`) — prevents recall context from being confused with user input
- Loaded memory transparency — briefing shows which memory/ files were loaded at startup
- Memory file frontmatter: `expires:`, `supersedes:`, `superseded_by:`, `archived:` fields
- INDEX.md frontmatter cache: `total_active`, `total_needs_review`
- Memory file naming convention: kebab-case, 3–5 words, no date prefix

**Session management**
- Session token isolation — Phase 1 generates a 6-char random token per session; stored in agent context only (no file written to disk)
- Checkpoint filenames embed session token: `YYYY-MM-DD-{session_token}-checkpoint-NN.md`
- Phase 2 orphan detection groups checkpoints by token — each token group produces one session log, preventing content mixing from concurrent sessions
- /wrapup and AUTO-SUMMARY glob only own-session checkpoints (by token); legacy checkpoints (no token) use backward-compatible fallback
- Session log frontmatter: `recapped:` (set by /recap) and `topics:` fields

**Session startup**
- `skills/startup/QMD.md` — QMD search strategy extracted from INSTRUCTIONS.md; lazy-loaded only when qmd tools are in the tool list
- Phase 1 greeting latency reduced: critical path is now vault.yml + MEMORY.md + time only; INDEX.md, token generation, and memory/ lazy-load deferred to after greeting
- Phase 2: all 5 background tasks (briefing, orphan detection, context pre-load, stale scan, overflow guard) run in parallel

**Skills — new capabilities**
- `skills/startup/PHASE2.md` — extracted from INSTRUCTIONS.md; token-aware orphan detection
- `skills/startup/AUTO-SUMMARY.md` — extracted from INSTRUCTIONS.md; token-aware checkpoint glob
- Contradiction detection in /learn — conflict menu: update / supersede / separate
- /learn: filename collision check with auto-incrementing `-NN` suffix
- /learn: type inference from content semantics (5 categories: behavioral/context/dev/project/reference)
- /learn: Active Projects intent detection
- Memory consolidation in /recap — topic frequency map, synthesize (not concatenate) overlapping files
- /recap run threshold: warn when unrecapped logs < `min_sessions`; 1 log → stop
- /recap promotion filter: promote only when topic appears in ≥ `min_frequency` logs
- /doctor: 11 new memory health checks including min_frequency validation and `update_channel` field
- /doctor `--fix`: rebuild INDEX.md, auto-rename non-compliant files, reset min_frequency
- /update `--dry-run` — safe preview with per-step output before committing changes
- /update migration log written to `07-logs/`
- /update read-new-execute-in-place bootstrap pattern

**Update channel**
- `update_channel` vault.yml field — controls which GitHub branch /update pulls from (`stable` → main, `next` → next, `N.x` → N.x); default: `stable`
- Major version bump guard in /update — requires explicit confirmation before crossing major version boundary
- /onboarding: commented-out `update_channel` template in vault.yml init

**Config**
- CHANGELOG.md frontmatter: `latest_version`, `released` for fast version checks
- vault.yml `stats:` block: `last_recap`, `last_doctor_run`, `last_doctor_fix`, `last_memory_review`
- vault.yml `recap:` block: `min_sessions` (default 6), `min_frequency` (default 2) — configurable
- Date format spec: local timezone (avoids UTC midnight off-by-one)

### Changed

- MEMORY.md restructured to 3 sections only: Identity & Personality, Active Projects, Critical Behaviors (~55 lines); Key Learnings/Decisions/Recurring Contexts removed
- MEMORY.md loaded with INDEX.md in parallel at session startup; memory/ files loaded lazily by topic
- memory/ consolidates all files previously in context/ (folder removed)
- INSTRUCTIONS.md reduced ~456 → ~323 lines; Phase 2, Auto-Summary, and QMD instructions extracted to skill files; no embedded scripts — plain-language requirements throughout
- Greeting simplified: no OneBrain header, no version number (version accessible via /help)
- Checkpoint hook: sends bare filename as hook reason instead of full JSON prompt — prevents prompt injection and reduces context noise
- /learn: writes to memory/ + auto-updates INDEX.md; one-file-per-concept rule enforced
- /recap: promotes session log insights to memory/ only — does NOT write to MEMORY.md; Critical Behaviors promoted exclusively via /learn
- /wrapup: writes session log only; checkpoint cleanup scoped to current month; recap reminder added
- /doctor: migration safety net for context/ folder; Pass C removes deprecated vault.yml keys
- /clone: includes INDEX.md; memory/ instead of context/; preserves recapped: on session logs; archive option added
- /onboarding: new MEMORY.md + INDEX.md templates; vault.yml recap block; upgrade guard
- README.md: folder structure updated, Memory Promotion section added
- Auto-wrapup removed — replaced by Auto Session Summary (fires silently at session end when /wrapup was not run)
- /update: read-new-execute-in-place bootstrap; 8-step vault migration; writes migration log to `07-logs/`

### Removed

- `context/` folder — merged into `memory/`
- Memory Tier Model section from INSTRUCTIONS.md (replaced by new design)
- Key Learnings, Key Decisions, Recurring Contexts sections from MEMORY.md

## [1.9.5] — 2026-04-15

Patch fixes for /update reliability on all platforms.

### Fixed
- /update: prevent spurious exit code 2 on self-replace step
- /update: unify update script for all platforms via Git Bash

## [1.9.4] — 2026-04-15

/update cross-platform fix (intermediate patch released same day as v1.9.3).

### Fixed
- /update: unify update script execution path for Git Bash on Windows

## [1.9.3] — 2026-04-15

Five background sub-agents added to Phase 2 startup; session-start briefing extended with context pre-loading, stale note scanning, and memory overflow guard.

### Added
- Phase 2 sub-agent: Context Pre-loader — reads relevant `context/` files based on active projects from MEMORY.md into session context silently
- Phase 2 sub-agent: Stale Note Scanner — surfaces project/area notes untouched 30+ days at session start
- Phase 2 sub-agent: MEMORY.md Overflow Guard — warns when MEMORY.md exceeds 160 lines with a `/recap` prompt
- Phase 2 sub-agent: Task Horizon Watcher — extends daily briefing with tasks due in the next 3 days
- `agents/link-suggester.md` — post-write link suggester; after `/learn` or `/capture` writes a note, auto-adds wikilinks to related vault notes
- /wrapup: auto recap trigger warns if MEMORY.md `updated:` date is 7+ days ago

### Fixed
- Phase 2: orphan write-fail no longer incorrectly returns `merged:{N}`
- Phase 2: `memory_lines:0` sentinel replaced with field-absent pattern
- Phase 2: `context_hints` path resolution made explicit (`vault_root/hint_path`)
- Session-Start Briefing: added failure fallback defaults for sub-agent
- Session-Start Briefing: empty-state condition now covers all 3 task sources
- /capture: removed duplicate link-search dispatch (Step 3 handles it)
- MEMORY.md overflow hint: corrected from `/distill` to `/recap`
- `areas_folder` added to Phase 1 dispatch payload

## [1.9.2] — 2026-04-15

Hardcoded folder path cleanup across all skills and agents.

### Fixed
- Replace all hardcoded folder names (e.g. `05-agent/`, `07-logs/`) with config placeholder variables throughout INSTRUCTIONS.md and all skill files

## [1.9.1] — 2026-04-15

MEMORY.md Key Learnings auto-sort after /recap and /doctor --fix.

### Added
- /recap: Step 6 sorts Key Learnings by confidence level (high → medium → low), newest-first within each tier
- /doctor --fix: sorts Key Learnings after Pass A if MEMORY.md was modified

## [1.9.0] — 2026-04-15

Memory lifecycle system — confidence scoring, supersession tracking, new /distill and /doctor skills, and contradiction detection in /learn.

### Added
- Memory Tier Model in INSTRUCTIONS.md with confidence metadata (`[conf:high/medium/low]`, `[verified:YYYY-MM-DD]`) and supersession convention
- Typed relationship frontmatter convention for notes (`uses:`, `depends_on:`, `contradicts:`, `supersedes:`, `caused_by:`)
- /distill skill — aggregate notes from multiple sessions on a topic into a structured knowledge note
- /doctor skill — vault health check: broken links, orphan notes, stale MEMORY.md entries, plugin config; `--fix` mode for automated repairs including fuzzy wikilink fix
- /doctor Pass B: group broken links by name, preserve `|display text` and `#anchor`, multi-candidate numbered list for ambiguous matches, post-fix report
- /learn: contradiction detection — conflict menu (update / supersede / separate)
- /recap: confidence scoring for promoted Key Learnings
- /connect: typed relationship link creation

### Fixed
- /doctor, /distill, /recap, /learn, /connect, /wrapup: multiple edge-case fixes from 6 review rounds

## [1.8.11] — 2026-04-12

Terminal output polish and version-check gate before /update.

### Added
- /update: version check before prompting — skips update if already on latest version

### Fixed
- Replace `[[wikilinks]]` with quoted note names in all terminal output templates (prevents rendering issues outside Obsidian)

## [1.8.10] — 2026-04-12

Windows timezone compatibility fix.

### Fixed
- Time command in session startup now uses Python → Node → system date fallback, compatible with Windows (no `date` with timezone flag)

## [1.8.9] — 2026-04-11

Checkpoint counting and orphan detection fixes.

### Fixed
- Checkpoint hook: count only today's checkpoints for correct NN numbering
- Phase 2: orphan frontmatter check reads `merged:` field before counting

## [1.8.8] — 2026-04-11

Skill routing added; checkpoint and /wrapup hardening.

### Added
- Skill routing — auto-invoke skills based on user intent without requiring slash commands; trigger conditions defined per skill in INSTRUCTIONS.md

### Fixed
- Skill routing trigger conditions tightened after review (reduce false positives)
- /wrapup: enforce full checkpoint incorporation before marking checkpoints as merged
- Checkpoint hook: Windows bash compatibility (Python/Node/pure-bash fallback for JSON building)

## [1.8.6] — 2026-04-11

Checkpoint system stabilization — removed broken PreCompact hook.

### Fixed
- Remove non-functional PreCompact hook; checkpoint system now Stop-hook only
- /tasks: exclude non-task folders (logs, archive, resources) from dashboard query

## [1.8.5] — 2026-04-10 / 2026-04-11

Two-phase session startup — immediate greeting with background sub-agent for inbox and insight.

### Added
- Phase 1: read `vault.yml` + `plugin.json` + `MEMORY.md` in parallel, greet immediately
- Phase 2: background sub-agent handles session logs, inbox count, orphan checkpoints, and proactive insight
- Greeting format: bold version header + time-of-day greeting line

### Fixed
- /tasks: exclude non-task folders from TASKS.md dashboard (double fix, same version bump)
- /update: Step 4h ensures `timezone` field is present in `vault.yml` on update

## [1.8.3] — 2026-04-10

/update script hardening.

### Fixed
- /update: wrap update script in `main()` function to prevent bash partial-read execution on mid-run download

## [1.8.2] — 2026-04-10

Plugin cache and Obsidian open fixes.

### Fixed
- Clear plugin cache on apply so updated files are picked up immediately
- Remove open-in-Obsidian step from individual file writes (consolidated to Stop hook)

## [1.8.1] — 2026-04-10

Checkpoint hook security and path fixes.

### Fixed
- Checkpoint hook: prevent JSON injection via untrusted input
- Checkpoint hook: add `CLAUDE_PLUGIN_ROOT` fallback for environments where env var is unset

## [1.8.0] — 2026-04-10

Checkpoint system — auto-save session context before compression and on schedule.

### Added
- Stop hook: auto-checkpoint every 15 messages or 30 minutes, writing a structured snapshot to `[logs_folder]/YYYY/MM/`
- /wrapup: merge all unmerged checkpoints into the session log before writing
- INSTRUCTIONS.md: checkpoint naming convention, orphan cleanup, and auto-summary integration
- /update: Step 4f injects checkpoint config into `vault.yml`
- Deferred Obsidian file open via Stop hook (prevents focus-steal on multi-file writes); opens all files written in the response

## [1.7.0] — 2026-04-05

/import Office format support via markitdown.

### Added
- /import: Word (.docx), PowerPoint (.pptx), and Excel (.xlsx) support via `markitdown`; lazy-installs on first use if not present

## [1.6.2] — 2026-04-03

/wrapup session retrospective section.

### Added
- /wrapup: "What Worked / What Didn't Work" section in session logs; skippable when nothing notable to report

## [1.6.1] — 2026-04-03

qmd auto-update after vault file changes.

### Added
- Run `qmd update` automatically after any vault file is written or edited, keeping the search index in sync

### Fixed
- /update (Windows): enforce TLS 1.2 and use `Invoke-WebRequest` for GitHub downloads

## [1.6.0] — 2026-04-03

/daily skill and session startup enhancements.

### Added
- /daily skill — daily briefing: surfaces tasks due today, overdue tasks, and open items from the last session
- Time-aware greeting with time-of-day emoji at session start
- Proactive insight surfaced in session startup from recent logs
- Command Response Profiles section in INSTRUCTIONS.md — sets verbosity expectations per command type

### Changed
- Removed confirmation prompts from /capture, /braindump, and /bookmark (proceed autonomously)
- /update refactored to shell script + Windows PowerShell support with version display

## [1.5.7] — 2026-04-03

/recap cross-session synthesis skill.

### Added
- /recap skill — reads 7 days of session logs, deduplicates insights, and promotes Key Learnings to MEMORY.md

## [1.5.6] — 2026-03-28

/moc vault portal command.

### Added
- /moc skill — create or update a Map of Content (MOC.md) linking all major vault sections; open in Obsidian

## [1.5.5] — 2026-03-27

qmd integration for faster vault search.

### Added
- /qmd skill — set up and manage qmd semantic search index over vault content
- INSTRUCTIONS.md: search strategy section explaining when to use qmd vs Grep/Glob

## [1.5.4] — 2026-03-27

/tasks archive exclusion and version badge.

### Added
- TASKS.md dashboard: exclude archive folder from task queries
- README: dynamic version badge

### Fixed
- Read plugin version from correct path for global installs

## [1.5.3] — 2026-03-27

/help and /tasks fixes.

### Added
- /help: show plugin version in output

### Fixed
- /tasks: correct Obsidian Tasks query syntax and simplify filter logic

## [1.5.2] — 2026-03-27

/tasks keyword and logs exclusion fixes.

### Fixed
- /tasks: fix keyword quote bug in query construction
- /tasks: exclude logs folder from task dashboard

## [1.5.1] — 2026-03-27

/tasks query syntax fix (intermediate patch).

### Fixed
- /tasks: update query syntax to match Obsidian Tasks plugin requirements

## [1.5.0] — 2026-03-26

@import migration for instruction files during /update.

### Added
- /update: migrate old monolithic instruction files to `@import` style during update, enabling modular skill file loading
- INSTRUCTIONS.md: TASKS.md added to vault structure documentation

## [1.4.0] — 2026-03-26

Live Obsidian task dashboard via /tasks.

### Added
- /tasks skill — generate TASKS.md with live Obsidian Tasks query blocks; keyword filtering; opens in Obsidian after write

## [1.3.0] — 2026-03-25

Dual install — fresh vault and existing vault support.

### Added
- /onboarding: support installing into an existing vault via the plugin marketplace (alongside the existing fresh-vault flow)
- /update: migrate `onebrain-local` plugin key to standard key

## [1.2.2] — 2026-03-25

/update cache and AskUserQuestion improvements.

### Added
- /update: clear plugin cache when upstream version matches local version, ensuring file-level updates are picked up
- Require `AskUserQuestion` tool for all user input prompts — no freetext question responses

## [1.2.1] — 2026-03-25

Early plugin infrastructure and /update allowlist.

### Added
- Add `.claude-plugin/` directory to /update skill allowlist so plugin metadata is included in updates
- /update: add .claude-plugin/ metadata to update file set

## [1.0.0] — 2026-03-21

Initial release — OneBrain vault with core skills, hooks, and /onboarding.

### Added
- Core skills: /onboarding, /braindump, /capture, /bookmark, /consolidate, /connect, /research, /summarize, /import, /reading-notes, /weekly, /wrapup, /learn, /update, /help
- /tasks slash command — scan inbox, projects, and knowledge for tasks; categorize by overdue, due soon, open, completed
- Auto-save session summary on Stop hook — silently writes session log when 3+ exchanges occurred and /wrapup was not run
- /onboarding: note-taking method selection (OneBrain, PARA, Zettelkasten); vault folder creation from template; `vault.yml` generation
- Install scripts for macOS/Linux (`install.sh`) and Windows (`install.ps1`)
