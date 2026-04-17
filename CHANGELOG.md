---
latest_version: 1.9.6
released: 2026-04-17
---

# Changelog

All notable changes to OneBrain are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

## [1.9.6] — 2026-04-17

### Added
- INDEX.md — separate lazy-load index for all memory/ files; loaded every session alongside MEMORY.md
- /memory-review — interactive memory pruning skill with soft delete to 06-archive/
- Per-turn relevance check — agent loads memory files matching session topic mid-conversation
- Memory injection fence (<memory-context>) — prevents recall context from being confused with user input
- expires: and supersedes:/superseded_by: frontmatter fields for memory files
- Contradiction detection in /learn — conflict menu: update / supersede / separate
- Memory consolidation in /recap — topic frequency map, merge with synthesis
- Loaded memory transparency — briefing shows which files were loaded at startup
- skills/startup/PHASE2.md — extracted from INSTRUCTIONS.md
- skills/startup/AUTO-SUMMARY.md — extracted from INSTRUCTIONS.md
- Session log frontmatter: recapped: (set by /recap) and topics: fields
- Memory file frontmatter: superseded_by: reverse pointer, archived: soft-delete field
- INDEX.md frontmatter cache: total_active, total_needs_review, last_review
- CHANGELOG.md frontmatter: latest_version, released for fast version checks
- vault.yml stats: block: last_recap, last_doctor_run, last_doctor_fix, last_memory_review
- vault.yml recap: block: min_sessions (default 6), min_frequency (default 2) — configurable
- /recap run threshold: warn when unrecapped logs < min_sessions; 1 log → stop
- /recap promotion filter: promote only when topic appears in >= min_frequency logs
- /learn filename collision check with auto-incrementing -NN rename suffix
- /learn type inference from content semantics (5 categories)
- /learn Active Projects intent detection
- /doctor: 10 new memory health checks including min_frequency validation
- /doctor --fix: rebuild INDEX.md, auto-rename non-compliant files, reset min_frequency
- Soft delete for memory files — delete moves to 06-archive/05-agent/memory/YYYY-MM/
- Pre-migration backup (MEMORY.md + context/) to 06-archive/ before /update migration
- /update --dry-run flag for safe preview
- /update migration log written to 07-logs/
- /update read-new-execute-in-place bootstrap pattern
- Memory file naming guidelines (kebab-case, 3–5 words, no date prefix)
- Date format spec: local timezone (avoids UTC midnight off-by-one)

### Changed
- MEMORY.md restructured to 3 sections: Identity, Active Projects, Critical Behaviors (~55 lines)
- MEMORY.md loaded with INDEX.md in parallel at session startup
- memory/ now includes all files previously in context/ (merged)
- INSTRUCTIONS.md reduced ~456 → ~338 lines
- /learn: writes to memory/ + auto-updates INDEX.md; one-file-per-concept rule
- /recap: promotes session log insights to memory/ only (was: MEMORY.md Key Learnings)
- /recap: does NOT write to MEMORY.md — Critical Behaviors via /learn only
- /wrapup: writes session log only + checkpoint cleanup (does NOT promote to memory/)
- /doctor: 10 new health checks + migration safety net
- /clone: includes INDEX.md + vault.yml; preserves recapped: on session logs; archive option
- /onboarding: new MEMORY.md + INDEX.md templates; vault.yml recap block; upgrade guard
- README.md: folder structure, memory tier docs, new Memory Promotion section
- Auto-wrapup rule moved from MEMORY.md Critical Behaviors to INSTRUCTIONS.md

### Removed
- context/ folder (merged into memory/)
- Memory Tier Model from INSTRUCTIONS.md (replaced by new design)
- Key Learnings, Key Decisions, Recurring Contexts from MEMORY.md
- Auto-wrapup rule from MEMORY.md Critical Behaviors (now in INSTRUCTIONS.md)

## [1.9.5] — 2026-04-15

See git log for details.
