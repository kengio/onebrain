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
- INSTRUCTIONS.md reduced ~456 → ~338 lines; Phase 2 and Auto-Summary extracted to skill files
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

See git log for details.
