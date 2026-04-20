---
latest_version: 1.10.8
released: 2026-04-20
---

# Changelog

All notable changes to OneBrain are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## v1.10.8 — /memory-review Redesign

- `/memory-review`: entry display redesigned — description first, status emoji (🟢/🟡/⚫), 📅 verified date, 🏷️ topics, backtick filename as footer with separator line
- `/memory-review`: split into Primary (keep/update/manage.../stop) and Manage (skip/needs-review/deprecate/delete) to respect 4-option AskUserQuestion limit
- `/memory-review`: safe-default principle — no-op or cancel listed first in every menu (skip, conf-unchanged, cancel)
- `/memory-review`: update uses staged model — conf in Call 1, edits in Call 2; nothing written until explicit confirm; change-type split into Call 3a/3b for 4-option limit
- `/memory-review`: Data Source pre-reads all entry frontmatter before starting (conf + verified not in INDEX.md)
- `/memory-review`: delete cancel returns to Manage menu; completion summary adds skipped + flagged counters
- `/memory-review`: Edge Cases rewritten with per-action commit rules (update uses staged model, not immediate commit)

## v1.10.7 — Documentation Reorganization

- INSTRUCTIONS.md restructured into 5 logical groups with comment headers for human and agent readability
- Added Working Principles section: think before acting, minimal footprint, surgical changes, define success first
- Permissions rewritten: inside-vault allowlist vs. outside-vault rule; shell/git commands now covered explicitly
- Session Behavior subsections reordered to match runtime sequence; Auto Checkpoint labeled as Hook-Triggered
- Boundaries: softened "always prefer adding to existing notes" to "when a suitable note already exists"
- CONTRIBUTING.md: sections reordered for contributor flow; Memory System paths use variable form; Recall Order and version bump requirement added

## v1.10.6 — Cross-Platform Session Token + Hook Fixes

- Cross-platform session token priority: `$WT_SESSION` → `$PPID > 1` → PowerShell parent PID → day-scoped cache
- Checkpoint filenames now use alphanumeric `{session_token}` instead of numeric `{PPID}`
- PreCompact infinite-block fix: mtime check on latest checkpoint replaces state-file skip check
- PostCompact writes `0:0` sentinel so Stop hook SKIP_WINDOW does not activate after compact
- Hooks moved to vault-level `.claude/settings.json` with relative paths — fixes iCloud path spaces
- `wrapup` and `AUTO-SUMMARY` state-file reset uses resolved session token; WT_SESSION sanitized to alphanumeric

## v1.10.5 — Terminal Output Formatting

- All 24 skill outputs use terminal-safe formatting: `─` separators, emoji headers, `⬜` checkboxes, `→` hints
- Replaces `**bold**`, `## headers`, `> blockquotes`, `- [ ]`, `| tables |` that rendered as literal text in CLI
- `/tasks` and `/moc` open the file in Obsidian after writing
- Interactive conflict flows in `/learn` and `/recap` use `AskUserQuestion`
- `/help` output replaced with grouped plain-text command list

## v1.10.4 — PPID Session Identity + PreCompact/PostCompact Hooks + Orphan Recovery

- **Breaking:** checkpoint filenames change to `YYYY-MM-DD-{PPID}-checkpoint-NN.md`; old files recovered automatically by `/wrapup`
- Session token is now `$PPID` — loaded once at startup, cached in context, survives compact
- `precompact` / `postcompact` hook modes: checkpoint before compaction, reset counter after
- `/wrapup` auto-detects and merges orphan checkpoints from previous sessions
- `/update`, `/doctor`, `install.sh`, `install.ps1` register all 3 hooks (Stop, PreCompact, PostCompact)

## v1.10.3 — Auto Session Summary Alignment

- Delete merged checkpoint files after session log write (write-success guard + safety-net scan)
- Check yesterday's folder for cross-midnight sessions
- Explicit frontmatter spec: `session: NN` field added; all `merged:` variants handled
- `## What Worked / Didn't Work` omit rule inlined — no longer relies on /wrapup cross-reference

## v1.10.2 — Instant Startup + Greeting Redesign

- Startup: Phase 2 background sub-agent removed; inline parallel tool calls replace it — no UI block
- Greeting: plain-text card format — Unicode line, time-based phrase, user name, date/time
- `/daily` morning mode: uses most recent session log (today or earlier) instead of strictly before today
- `/wrapup`: `## Related Notes` removed; all three session files now share the same 6-section structure
- `/update`: changelog displayed verbatim before confirmation; backup renamed `MEMORY-YYYY-MM-DD.md`
- `PHASE2.md` deleted; all references cleaned up from `/doctor`, `AUTO-SUMMARY.md`, `INSTRUCTIONS.md`

## v1.10.1 — Migration Hardening + Cross-Skill Consistency

- `/update` Step 3: explicit memory file rename rules; INDEX.md wikilinks updated after rename
- `/update` Step 4: compact MEMORY.md Identity format; skip-rewrite checks field labels not just headings
- `/update` Step 5: exact column spec enforced; existing Description values preserved on rewrite
- `/doctor`: stale check reads `memory/` frontmatter; new check detects old Identity format; `--fix` rewrites in-place
- `INSTRUCTIONS.md`: startup reads `## Identity & Personality` — fixes silent personality fallback after migration
- `/clone`, `/distill`, `/weekly`: updated to reference `memory/` files and `## Identity & Personality`
- Checkpoint hook: per-session NN counter in state file; fixed glob quoting for iCloud paths

## v1.10.0 — Memory System Redesign

**New command: `/memory-review`** — interactive pruning of memory files (keep / update / deprecate / delete / archive)

- `memory/` folder replaces MEMORY.md Key Learnings; `INDEX.md` as lazy-load index with typed per-concept frontmatter
- Session token isolation: concurrent sessions never mix checkpoints (`YYYY-MM-DD-{token}-checkpoint-NN.md`)
- `/learn`: contradiction detection, INDEX.md sync, type inference (5 categories), filename collision check
- `/recap`: promotes to `memory/` only; frequency filter (`min_frequency`) and run threshold (`min_sessions`)
- `/doctor`: 11 new memory health checks; `--fix` rebuilds INDEX.md and auto-renames non-compliant files
- `/update`: `--dry-run` preview, 8-step vault migration, read-new-execute-in-place bootstrap; `update_channel` field added
- MEMORY.md restructured to 3 sections: Identity & Personality, Active Projects, Critical Behaviors
- Phase 1 startup latency reduced; INSTRUCTIONS.md reduced ~456 → ~323 lines

## v1.9.5 — Update Reliability Fixes

- `/update` reliability fixes for Windows and cross-platform environments

## v1.9.3 — Phase 2 Background Agents

- Phase 2 startup extended with 5 background sub-agents: context pre-loading, stale note scanning, task horizon (next 3 days), MEMORY.md overflow guard, link suggestion after `/learn` and `/capture`
- Multiple Phase 2 and briefing edge-case fixes

## v1.9.0 — Memory Lifecycle System

**New command: `/distill`** — crystallize a completed topic thread into a permanent knowledge note in `03-knowledge/`

**New command: `/doctor`** — vault health check: broken links, orphan notes, stale memory, inbox backlog; `--fix` auto-repairs

- Confidence metadata on MEMORY.md Key Learnings: `[conf:high/medium/low]` + `[verified:YYYY-MM-DD]`
- `/learn`: contradiction detection — conflict menu (update / supersede / separate)
- `/recap`: confidence scoring; auto-sort by confidence tier
- Typed relationship frontmatter (`uses:`, `depends_on:`, `contradicts:`, `supersedes:`, `caused_by:`)
- Hardcoded folder paths replaced with config placeholders across all skills and agents

## v1.8.8 — Skill Routing + Checkpoint Hardening

**New feature: skill routing** — agent auto-invokes skills based on user intent without a slash command

- `/wrapup`: enforce full checkpoint incorporation before marking merged
- Checkpoint hook: Windows bash compatibility; fixed NN counting; removed broken PreCompact hook
- `/tasks`: exclude logs, archive, and resources folders from dashboard
- Windows timezone and terminal output fixes (v1.8.9–v1.8.11)

## v1.8.5 — Two-Phase Session Startup

- Greet immediately; background sub-agent handles inbox count and orphan checkpoint detection

## v1.8.0 — Checkpoint System

- Stop hook: auto-checkpoint every 15 messages or 30 minutes
- `/wrapup`: merge all unmerged checkpoints before writing session log
- Deferred Obsidian file open via Stop hook; `/update` injects checkpoint config into `vault.yml`

## v1.7.0 — Import Office Formats

**New capability: `/import` Office formats** — Word (.docx), PowerPoint (.pptx), Excel (.xlsx) via `markitdown`; lazy-installs on first use

## v1.6.0 — Daily Briefing + Session Enhancements

**New command: `/daily`** — daily briefing: tasks due today, overdue tasks, open items from last session

- Time-aware greeting with emoji; proactive insight from recent session logs at startup
- Command Response Profiles added to INSTRUCTIONS.md (verbosity per command type)
- `/update` refactored to shell script + Windows PowerShell
- `/wrapup`: "What Worked / What Didn't Work" retrospective section added (v1.6.2)

## v1.5.7 — Recap Command

**New command: `/recap`** — cross-session synthesis: reads session logs, deduplicates insights, promotes Key Learnings to MEMORY.md

## v1.5.6 — Map of Content

**New command: `/moc`** — vault portal: create or update MOC.md linking all major vault sections; opens in Obsidian

## v1.5.5 — QMD Semantic Search

**New command: `/qmd`** — set up and manage qmd semantic search index over vault content

- `/tasks` fixes: query syntax, keyword quoting, logs/archive exclusion (v1.5.1–v1.5.4)
- `/help`: show plugin version; dynamic version badge in README

## v1.5.0 — Update Import Style

- `/update`: migrate instruction files to `@import` style during update

## v1.4.0 — Task Dashboard

**New command: `/tasks`** — live Obsidian task dashboard (TASKS.md) with keyword filtering; opens in Obsidian after write

## v1.3.0 — Dual Install

- Fresh vault and existing vault install via plugin marketplace

## v1.2.x — Update + Input Hardening

- `/update` cache improvements; `AskUserQuestion` required for all user input prompts

## v1.0.0 — Initial Release

**Commands:** /onboarding, /braindump, /capture, /bookmark, /consolidate, /connect, /research, /summarize, /import, /reading-notes, /weekly, /wrapup, /learn, /update, /help

- Auto-save session summary on Stop hook
- `/onboarding`: note-taking method selection; vault folder creation; `vault.yml` generation
- Install scripts for macOS/Linux and Windows
