---
latest_version: 2.0.8
released: 2026-04-26
---

# CLI Changelog

All notable changes to the OneBrain CLI binary (`@onebrain-ai/cli`).
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

> **Versioning:** CLI version is tracked in `package.json`. Bump only when TypeScript source changes.
> For plugin changes (skills, agents, hooks, INSTRUCTIONS), see [PLUGIN-CHANGELOG.md](PLUGIN-CHANGELOG.md).

## [Unreleased]

## v2.0.8 — refactor: collapse monorepo into single package

- refactor: remove packages/ workspace structure — CLI and core are now one package at repo root
- refactor(src): domain logic lives in src/lib/, commands in src/commands/, hidden internals in src/commands/internal/
- refactor(build): single bun build entry point (src/index.ts → dist/onebrain); no workspace hoisting
- refactor(config): merge root tsconfig, biome.json, and package.json — no per-package configs
- fix(output): force UTF-8 encoding unconditionally — fixes emoji/arrow rendering on macOS terminals
- feat(doctor): TTY mode now shows emoji status icons (✅ / ⚠️ / ❌) and a spinner during health checks

## v2.0.3 — fix: checkpoint binary correctness

- fix(checkpoint): derive checkpoint NN from disk scan in both stop and precompact hooks — guarantees sequential numbering even when Claude fails to write a file
- fix(checkpoint): handlePostcompact writes last_ts=now so precompact recency guard blocks re-fire within 5 minutes after a compact cycle
- fix(checkpoint): handlePrecompact double-compact guard — returns early if pending_stub already set
- fix(checkpoint): handleStop preserves pending_stub in state write
- fix(checkpoint): postcompactFallback — disk scan for unmerged precompact stubs when state has no pending_stub
- fix(checkpoint): loadVaultSettings regex strips surrounding quotes from logs: folder value

## v2.0.2 — fix: complete hook migration to CLI

- fix(hooks): migrate Stop/PreCompact/PostCompact to onebrain checkpoint CLI; delete qmd-reindex.sh
- fix(register-hooks): gains --qmd / --remove-qmd flags; migration Step 7 registers PostToolUse hook when qmd_collection is set
- feat(session-init): expose session token and qmd status via JSON output
- feat(orphan-scan): CLI-based orphan detection replaces inline bash

## v2.0.0 — CLI Binary (initial release)

- feat: compiled TypeScript binary replaces all bash/Python scripts
- feat(internal): session-init, orphan-scan, checkpoint, qmd-reindex
- feat(ops): vault-sync, register-hooks, migrate
- feat(init): onebrain init — covers fresh vault and existing vault scenarios
- feat(update): atomic update with binary validation
- feat(doctor): qmd-embeddings check, version drift, orphan checkpoints
- feat(release): 6-platform binaries, npm package (@onebrain-ai/cli)
