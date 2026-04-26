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

## v2.0.7 — fix: binary validation regex

- fix(update): binary validation regex `/^\d+\.\d+/` → `/v\d+\.\d+/` — matches actual `onebrain --version` output format (`OneBrain v2.0.x — released …`)

## v2.0.6 — fix: postcompact auto-wrapup + update improvements + vault root auto-detect

- fix(checkpoint): replace fill-checkpoint with auto-wrapup `<token>` in postcompact handler — orphan checkpoints are now recovered into a session log instead of re-filled
- fix(checkpoint): precompact simplified — resets count only; no stub file writes; remove pending_stub from state
- fix(update): vault.yml existence guard exits 1 with clear error message when run outside a vault
- fix(update): skip binary install step when latestVersion === currentVersion (already up to date)
- feat(update): add TTY spinners for vault-sync and binary install steps
- feat(session-init, checkpoint): auto-detect vault root by walking up from cwd; add --vault-dir override option

## v2.0.5 — fix: Windows compatibility

- fix(windows): route qmd-reindex, session-init, validator, and update through `powershell.exe -NoProfile -Command` on win32 — Bun.spawn cannot invoke .cmd/.ps1 scripts via CreateProcess without a shell wrapper
- fix(register-hooks): Bash permission format — colon separator (`Bash(git:*)`) was wrong syntax; correct form uses space (`Bash(git *)`)
- fix(output): force UTF-8 encoding on stdout/stderr at CLI startup on win32 to prevent unicode garbling of `·` and `—` in piped output
- refactor(qmd-reindex): export buildQmdSpawnArgs helper for testability; add tests for Windows path with single-quote escaping

## v2.0.4 — fix: checkpoint postcompact advancement + backfill-recapped cutoff

- fix(checkpoint): handlePostcompact now sets last_stop_nn to stubNn after emitting fill-checkpoint block — prevents stop hooks from reusing the same NN and overwriting the stub file
- fix(checkpoint): reset script writes 3-field state (`0:<epoch>:00`) — was writing 2-field format which bypassed the 60-second skip window after /wrapup
- fix(update): backfill-recapped.sh accepts optional cutoff_date arg; migration Step 6 reads stats.last_recap from vault.yml and passes it as cutoff — prevents /update from re-marking recent sessions on every run

## v2.0.3 — feat: qmd hook wiring + npm README

- fix(register-hooks): add --qmd flag to register PostToolUse hook in settings.json when qmd_collection is configured
- fix(hooks): wire up PostToolUse qmd-reindex entry — was missing since v2.0.0
- docs(npm): add README.md for npm package page

## v2.0.2 — chore: npm package metadata

- chore(package): add description, keywords, homepage, repository, bugs, license fields
- chore(package): add files field to include dist/onebrain in npm publish (was missing — package published empty)

## v2.0.1 — fix: npm release distribution

- fix(package): rename npm package from `@onebrain/cli` to `@onebrain-ai/cli`
- fix(package): move @onebrain/core to devDependencies — bundled into dist/onebrain at build time; consumers do not need it
- fix(release): use `npm publish` instead of `bun publish` — bun publish ignores ~/.npmrc auth for scoped packages
- fix(release): inject BUILD_VERSION at compile time via --define; update release.yml to pass version string
- fix(release): drop bun-windows-arm64 binary target — unsupported in bun v1.2.x
- fix(release): npm-publish job is optional — create-release runs even if publish fails

## v2.0.0 — CLI binary (initial release)

- feat: compiled TypeScript binary replaces all bash/Python scripts
- feat(internal): session-init, orphan-scan, checkpoint, qmd-reindex
- feat(ops): vault-sync, register-hooks, migrate
- feat(init): onebrain init — covers fresh vault and existing vault scenarios
- feat(update): atomic update with binary validation
- feat(doctor): qmd-embeddings check, version drift, orphan checkpoints
- feat(release): 6-platform binaries (darwin-arm64/x64, linux-arm64/x64, windows-x64), npm package (@onebrain-ai/cli)
