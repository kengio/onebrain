---
latest_version: 2.0.7
released: 2026-04-27
---

# Plugin Changelog

All notable changes to the OneBrain plugin (skills, agents, hooks, INSTRUCTIONS.md).
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

> **Versioning:** Plugin version is tracked in `plugin.json`. Bump when skills, agents, hooks, or INSTRUCTIONS change.
> For CLI binary changes, see [CHANGELOG.md](CHANGELOG.md).

## [Unreleased]

## v2.0.7 — fix: postcompact Path B, backfill-recapped skip condition, session token tooltip

- fix(INSTRUCTIONS): postcompact auto-wrapup adds Path B — when no checkpoint files exist, synthesize session log from current context (was a no-op, causing auto-compact to write nothing)
- fix(INSTRUCTIONS): remove merged:true write step from postcompact; simplify delete step
- fix(INSTRUCTIONS): update session_token tooltip to include $TMUX_PANE and $TERM_SESSION_ID priority
- fix(update): migration-steps.md Step 6 skips backfill-recapped when stats.backfill_recapped_done: true is set in vault.yml
- fix(wrapup): update session token mismatch gotcha note to reflect CLI v2.0.12 fix

## v2.0.6 — fix: replace bash scripts with CLI; fix SessionStart hook breaking vault after /update

- fix(register-hooks): remove SessionStart hook registration — session-init is called by agent startup, not via hook
- fix(wrapup): reset-checkpoint-counter.sh → onebrain checkpoint reset
- fix(update): vault-sync.sh → onebrain vault-sync; backfill-recapped.sh → onebrain migrate backfill-recapped
- fix(update): pin-to-vault.sh + clean-plugin-cache.sh → onebrain vault-sync (doctor, onboarding)
- feat(qmd): register-hooks.sh --qmd/--remove-qmd → onebrain register-hooks --qmd/--remove-qmd
- chore: delete all replaced bash scripts (hooks/, update/scripts/, wrapup/scripts/)
- fix(update): bootstrap step downloads only SKILL.md — no bash scripts needed

## v2.0.5 — fix: vault skill fixes (grep encoding, PostCompact auto-wrapup, /update CLI migration, auto-summary routing)

- fix(startup): task scan grep pattern — replaced `\d` with `[0-9]` for POSIX grep compatibility on macOS
- fix(checkpoint): replace fill-checkpoint PostCompact handler with auto-wrapup — when block reason matches `auto-wrapup: <token>`, recover orphan checkpoints for that token into a session log
- fix(update): Step 7 standard hooks now use onebrain register-hooks CLI; qmd PostToolUse hook still via register-hooks.sh
- feat(update): CLI version check — after vault update, compare installed onebrain CLI against npm latest; prompt to update if newer is available
- feat(auto-summary): add action item routing (Step 4b parity with /wrapup) — after writing session log, route tasks to matching project notes via keyword scoring

## v2.0.4 — feat: /wrapup auto-routes action items to project notes

- feat(wrapup): Step 4b — after writing the session log, extract `- [ ]` action items and route each to the most relevant project note via keyword scoring
- feat(wrapup): dedup guard — skips appending if identical task line already exists in the target file
- feat(wrapup): routing report in Step 8 confirmation — lists each task and its destination note
- feat(wrapup): non-blocking — routing errors are silently skipped per task; session log always written first

## v2.0.1 — fix: /wrapup session numbering

- fix(wrapup): Step 2 glob now requires today's date as a literal prefix — prevents counting all sessions in the month when determining session number for the current day

> **Note:** v2.0.2 and v2.0.3 were CLI-only releases (npm metadata, qmd hook wiring, README). No plugin files changed — see [CHANGELOG.md](CHANGELOG.md).

## v1.10.18 — fix: session logs must not include recapped: in frontmatter

- fix(auto-summary): add explicit prohibition against writing `recapped:` or `topics:` in session log frontmatter
- fix(auto-summary): add Known Gotchas section documenting that writing `recapped:` causes /recap to silently skip the log
- fix(wrapup): strengthen `recapped:` prohibition from descriptive to directive with consequence clause

## v1.10.17 — revert onebrain@kengio → onebrain@onebrain

- fix: revert plugin identifier back to onebrain@onebrain (reverts v1.10.12/v1.10.15 rename that broke vault installs)
- fix: rename extraKnownMarketplaces key back to "onebrain" — restores original dev marketplace for repo context
- fix(update): skip extraKnownMarketplaces and onebrain@kengio during settings merge
- fix(onboarding): update install command back to /plugin install onebrain@onebrain

## v1.10.16 — vault-level plugin loading enforcement

- feat(update): add pin-to-vault.sh — pins installed_plugins.json installPath to vault directory
- fix(update): pin-to-vault.sh — fix loop early exit, move plugin.json read outside loop, add empty installPath guard
- fix(update): clean-plugin-cache.sh now deletes ALL onebrain cache versions on every /update
- feat(doctor): Config check detects when plugin is loading from user cache and warns to run /doctor --fix
- feat(doctor): /doctor --fix Pass A pins installPath to vault and clears cache
- feat(onboarding): post-Step 0 calls pin-to-vault.sh then clean-plugin-cache.sh

## v1.10.15 — fix plugin marketplace key mismatch

- fix: extraKnownMarketplaces key renamed "onebrain" → "kengio" to match enabledPlugins identifier onebrain@kengio

## v1.10.14 — fix stale "source repo" refs, plugin load error, H1 heading consistency

- fix(update): description and body heading now say "from GitHub" instead of "from the source repo"
- fix(startup): remove YAML frontmatter from QMD.md — was incorrectly registered as a skill by the plugin loader
- fix(skills): standardise H1 headings — update/daily/help/qmd were using /command format

## v1.10.13 — fix /update: CHANGELOG sync, stale file cleanup, predefined scripts, lazy loading

- fix(update): root file sync now explicitly copies README, CONTRIBUTING, CHANGELOG from repo root to vault root
- fix(update): plugin folder sync now deletes stale vault files absent from source repo
- feat(update): add 3 predefined scripts: vault-sync.sh, register-hooks.sh, backfill-recapped.sh
- refactor(update): extract Vault Migration Steps 1–9 to references/migration-steps.md for lazy loading
- feat(update): add clean-plugin-cache.sh — removes stale onebrain cache versions

## v1.10.12 — skill quality: authoring patterns, progressive loading, predefined scripts

- docs(skills): add Known Gotchas, Explain-the-Why, and In-Skill Examples to all 24 applicable skills
- refactor(skills): split large skills into references/ subdirectories
- refactor(scripts): add startup/scripts/ with 4 predefined shell scripts replacing inline bash
- refactor(wrapup): extract 14-line session token reset to wrapup/scripts/reset-checkpoint-counter.sh
- feat(import): add optional Step 6 — integrate imported notes into related vault notes after import

## v1.10.11 — skill exclusion clauses + multi-harness entrypoints

- docs(skills): add "Do NOT use for:" exclusion clause to all 25 skill descriptions
- feat(harness): add references/gemini-tools.md — Gemini CLI tool name mapping
- feat(harness): add references/codex-tools.md — Codex CLI tool name mapping and sub-agent dispatch guide
- fix(harness): update GEMINI.md and AGENTS.md to load harness reference before INSTRUCTIONS.md

## v1.10.10 — MEMORY-INDEX rename + README memory layer

- rename: INDEX.md → MEMORY-INDEX.md across all plugin files
- README: four-tier table restructured; MEMORY-INDEX.md added as always-loaded enabler
- fix: stale bare INDEX shorthand in memory-review, doctor, and clone skills

## v1.10.9 — PowerShell install fixes

- fix(ps1): write settings.json without UTF-8 BOM on PowerShell 5
- fix(ps1): exit early in non-interactive sessions; validate ZIP before Expand-Archive
- fix(ps1): Set-StrictMode -Version Latest; force [object[]] cast on hook array
- fix(update): use WebFetch for version check instead of git commands (prevents hang on Windows)

## v1.10.8 — /memory-review redesign

- /memory-review: entry display redesigned — description first, status emoji, verified date, topics
- /memory-review: split into Primary and Manage menus to respect 4-option AskUserQuestion limit
- /memory-review: safe-default principle — non-destructive option listed first in every menu
- /memory-review: update uses staged model — conf in Call 1, edits in Call 2; nothing written until explicit confirm

## v1.10.7 — documentation reorganization

- INSTRUCTIONS.md restructured into 5 logical groups with comment headers
- Added Working Principles section: think before acting, minimal footprint, surgical changes, define success first
- Permissions rewritten: inside-vault allowlist vs. outside-vault rule
- CONTRIBUTING.md: sections reordered for contributor flow; Recall Order and version bump requirement added

## v1.10.6 — cross-platform session token + hook fixes

- Cross-platform session token priority: $WT_SESSION → $PPID > 1 → PowerShell parent PID → day-scoped cache
- Checkpoint filenames now use alphanumeric {session_token} instead of numeric {PPID}
- PreCompact infinite-block fix: mtime check on latest checkpoint replaces state-file skip check
- Hooks moved to vault-level .claude/settings.json with relative paths — fixes iCloud path spaces

## v1.10.5 — terminal output formatting

- All 24 skill outputs use terminal-safe formatting: `─` separators, emoji headers, `⬜` checkboxes, `→` hints
- Replaces markdown syntax that rendered as literal text in CLI
- /tasks and /moc open the file in Obsidian after writing

## v1.10.4 — PPID session identity + PreCompact/PostCompact hooks + orphan recovery

- **Breaking:** checkpoint filenames change to YYYY-MM-DD-{PPID}-checkpoint-NN.md
- Session token is now $PPID — loaded once at startup, cached in context, survives compact
- precompact / postcompact hook modes: checkpoint before compaction, reset counter after
- /wrapup auto-detects and merges orphan checkpoints from previous sessions

## v1.10.3 — auto session summary alignment

- Delete merged checkpoint files after session log write (write-success guard)
- Check yesterday's folder for cross-midnight sessions
- Explicit frontmatter spec: session: NN field added; all merged: variants handled

## v1.10.2 — instant startup + greeting redesign

- Startup: Phase 2 background sub-agent removed; inline parallel tool calls replace it
- Greeting: plain-text card format — Unicode line, time-based phrase, user name, date/time
- /wrapup: ## Related Notes removed; all three session files share the same 6-section structure
- PHASE2.md deleted; all references cleaned up

## v1.10.1 — migration hardening + cross-skill consistency

- /update Step 3: explicit memory file rename rules; INDEX.md wikilinks updated after rename
- /update Step 4: compact MEMORY.md Identity format
- /doctor: stale check reads memory/ frontmatter; new check detects old Identity format
- INSTRUCTIONS.md: startup reads ## Identity & Personality

## v1.10.0 — memory system redesign

**New command: `/memory-review`** — interactive pruning of memory files (keep / update / deprecate / delete / archive)

- memory/ folder replaces MEMORY.md Key Learnings; INDEX.md as lazy-load index with typed per-concept frontmatter
- Session token isolation: concurrent sessions never mix checkpoints
- /learn: contradiction detection, INDEX.md sync, type inference (5 categories)
- /recap: promotes to memory/ only; frequency filter and run threshold
- /doctor: 11 new memory health checks; --fix rebuilds INDEX.md
- /update: --dry-run preview, 8-step vault migration, bootstrap; update_channel field added

## v1.9.5 — update reliability fixes

- /update reliability fixes for Windows and cross-platform environments

## v1.9.3 — phase 2 background agents

- Phase 2 startup extended with 5 background sub-agents: context pre-loading, stale note scanning, task horizon, MEMORY.md overflow guard, link suggestion

## v1.9.0 — memory lifecycle system

**New command: `/distill`** — crystallize a completed topic thread into a permanent knowledge note

**New command: `/doctor`** — vault health check: broken links, orphan notes, stale memory, inbox backlog

- Confidence metadata on MEMORY.md Key Learnings
- /learn: contradiction detection with conflict menu
- /recap: confidence scoring; auto-sort by confidence tier

## v1.8.8 — skill routing + checkpoint hardening

**New feature: skill routing** — agent auto-invokes skills based on user intent without a slash command

- /wrapup: enforce full checkpoint incorporation before marking merged
- Checkpoint hook: Windows bash compatibility; fixed NN counting

## v1.8.5 — two-phase session startup

- Greet immediately; background sub-agent handles inbox count and orphan checkpoint detection

## v1.8.0 — checkpoint system

- Stop hook: auto-checkpoint every 15 messages or 30 minutes
- /wrapup: merge all unmerged checkpoints before writing session log

## v1.7.0 — import office formats

**New capability: `/import` Office formats** — Word (.docx), PowerPoint (.pptx), Excel (.xlsx) via markitdown

## v1.6.0 — daily briefing + session enhancements

**New command: `/daily`** — daily briefing: tasks due today, overdue tasks, open items from last session

- Time-aware greeting with emoji
- Command Response Profiles added to INSTRUCTIONS.md
- /wrapup: "What Worked / What Didn't Work" retrospective section added

## v1.5.7 — recap command

**New command: `/recap`** — cross-session synthesis: reads session logs, deduplicates insights, promotes Key Learnings to MEMORY.md

## v1.5.6 — map of content

**New command: `/moc`** — vault portal: create or update MOC.md linking all major vault sections

## v1.5.5 — QMD semantic search

**New command: `/qmd`** — set up and manage qmd semantic search index over vault content

## v1.5.0 — update import style

- /update: migrate instruction files to @import style during update

## v1.4.0 — task dashboard

**New command: `/tasks`** — live Obsidian task dashboard (TASKS.md) with keyword filtering

## v1.3.0 — dual install

- Fresh vault and existing vault install via plugin marketplace

## v1.2.x — update + input hardening

- /update cache improvements; AskUserQuestion required for all user input prompts

## v1.0.0 — initial release

**Commands:** /onboarding, /braindump, /capture, /bookmark, /consolidate, /connect, /research, /summarize, /import, /reading-notes, /weekly, /wrapup, /learn, /update, /help

- Auto-save session summary on Stop hook
- /onboarding: note-taking method selection; vault folder creation; vault.yml generation
- Install scripts for macOS/Linux and Windows
