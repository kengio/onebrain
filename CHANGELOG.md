---
latest_version: 1.10.6
released: 2026-04-19
---

# Changelog

All notable changes to OneBrain are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## v1.10.6 — Cross-Platform Session Token + Hook Fixes

- Cross-platform session token: `$WT_SESSION` (Windows Terminal) → `$PPID > 1` (Mac/Linux) → PowerShell parent PID → day-scoped cache. Fixes `$PPID=1` on Windows Git Bash causing checkpoint collisions across windows.
- Checkpoint filenames now use `{session_token}` (alphanumeric) instead of `{PPID}` (numeric only)
- PreCompact infinite-block fix: mtime check on latest checkpoint file (300s window) replaces state-file skip check, which was corrupted by intervening Stop hooks
- Hooks moved to vault-level `.claude/settings.json` with relative paths — resolves silent failures from spaces in iCloud absolute paths
- PostCompact writes `0:0` sentinel (not `0:NOW`) so Stop hook's SKIP_WINDOW does not activate after compact; ELAPSED zeroed when `LAST_TS=0` to prevent immediate time-threshold fire
- `wrapup` and `AUTO-SUMMARY` state-file reset updated to use resolved session token (not bare `$PPID`) — fixes incorrect state file on Windows WT_SESSION
- WT_SESSION sanitized with `tr -cd 'a-zA-Z0-9'` to strip GUID punctuation; token is always alphanumeric
- Removed debug tracing from hook script

## v1.10.5 — Terminal Output Formatting

All 25 skill outputs now use terminal-safe formatting: 62-char `─` separators, emoji section headers, `⬜` task checkboxes, and `→` hints replace `**bold**`, `> blockquotes`, `## headers`, `- [ ]`, and `| tables |` that rendered as literal characters in Claude Code CLI. `/tasks` and `/moc` now open the file in Obsidian after writing. Interactive conflict flows in `/learn` and `/recap` use `AskUserQuestion`. `/help` output replaced with grouped plain-text command list.

## v1.10.4 — PPID Session Identity + PreCompact/PostCompact Hooks + Orphan Recovery

**Breaking:** Checkpoint filenames change from `YYYY-MM-DD-{random6}-checkpoint-NN.md` to `YYYY-MM-DD-{PPID}-checkpoint-NN.md`. Old files appear as orphans on first `/wrapup` — recovered automatically.

- Session token is now `$PPID` — loaded once at startup, cached in context, survives compact
- `precompact` / `postcompact` hook modes: checkpoint before compaction, reset counter after
- `/wrapup` auto-detects and merges orphan checkpoints from previous sessions
- `/update` / `/doctor` / `install.sh` / `install.ps1` register all 3 hooks (Stop, PreCompact, PostCompact)

## [1.10.3] — 2026-04-18

Auto Session Summary aligned with /wrapup behavior.

- Delete merged checkpoint files after session log write (write-success guard + safety-net scan)
- Check yesterday's folder for cross-midnight sessions (matches /wrapup Step 1.3)
- Explicit frontmatter spec: `session: NN` field added; all `merged:` variants handled
- `## What Worked / Didn't Work` omit rule inlined — no longer relies on /wrapup cross-reference

## [1.10.2] — 2026-04-18

Instant startup and greeting redesign.

- Startup: Phase 2 background sub-agent removed; inline tool calls replace it (Glob inbox, Grep tasks, Glob checkpoints) — no UI block
- Greeting: plain-text card format — Unicode line, time-based phrase + user name, date/time; status block only when content exists
- `/daily` morning mode: most recent session log (today or earlier) instead of strictly before today
- Checkpoint template: restored missing `## Insights & Learnings` and `## What Worked / Didn't Work` sections
- `/update`: changelog entry displayed verbatim before confirmation; backup renamed `MEMORY-YYYY-MM-DD.md`
- `/wrapup`: `## Related Notes` removed from session log template — all three session files (checkpoint, auto-summary, session log) now share the same 6-section structure
- `PHASE2.md` deleted; `/doctor` PHASE2 check removed; `AUTO-SUMMARY.md` and `INSTRUCTIONS.md` references cleaned up

## [1.10.1] — 2026-04-18

Migration hardening and cross-skill consistency.

- `/update` Step 3: explicit memory file rename rules (date prefix, numeric segment, >5 words → kebab-case 3–5 words); INDEX.md wikilinks updated after rename
- `/update` Step 4: compact MEMORY.md Identity format (5-field block); skip-rewrite now checks field labels not just headings — v1.10.0 vaults with old 6-field format now correctly migrate; field extraction hints; Language field conditional (omit if absent)
- `/update` Step 5: exact column spec (`File | Topics | Type | Status | Description`) enforced; existing Description values preserved on rewrite
- `/doctor`: stale check reads `memory/` file frontmatter instead of MEMORY.md Key Learnings; new health check detects old Identity format; `--fix` rewrites Identity to compact format in-place
- `/onboarding`: Step 9 MEMORY.md template updated to compact Identity format
- `INSTRUCTIONS.md`: startup now reads `## Identity & Personality` — fixes silent personality fallback after migration
- `/clone`, `/distill`, `/weekly`: updated to reference `memory/` files and `## Identity & Personality` instead of removed MEMORY.md sections
- Checkpoint hook: sends just `YYYY-MM-DD-checkpoint-NN.md` as reason instead of full instruction paragraph; fixed glob quoting for iCloud paths with spaces; NN now per-session counter in state file — always starts at 01 each session

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
