---
latest_version: 2.1.7
released: 2026-04-29
---

# CLI Changelog

All notable changes to the OneBrain CLI binary (`@onebrain-ai/cli`).
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

> **Versioning:** CLI version is tracked in `package.json`. Bump only when TypeScript source changes.
> For plugin changes (skills, agents, hooks, INSTRUCTIONS), see [PLUGIN-CHANGELOG.md](PLUGIN-CHANGELOG.md).

## [Unreleased]

## v2.1.7 — feat: rotating multi-sentence tagline + 3-phase banner intro

- feat(cli-banner): banner intro is now a 3-phase reveal — CRT scan top→bottom builds the art in white, holds 600ms, then a diagonal rainbow flow (bottom-left → top-right) brings it to neon, followed by a white shimmer sweep on the same diagonal.
- feat(cli-banner): tagline rotates through 3 sentences via wipe-swap transitions — "Your AI Remembers You" → "Your AI Catches Insights" → "Your AI Thinking Partner". Prefix "Your AI" stays neon cyan; trailing 2 words are neon magenta during all sentences.
- feat(cli-banner): final lock shimmer sweeps the full tagline (prefix + trailing) and burns the magenta trailing out to neon cyan, settling the entire tagline as cyan.
- chore(cli-banner): static no-truecolor fallback uses the signature "Your AI Thinking Partner" line in cyan.

## v2.1.6 — feat: cyberpunk tagline animation; orphan-scan drops `merged:` filter

- feat(cli-banner): merged typewriter + Matrix-style glitch decode with per-word reading rhythm; cyan cursor tracks the head, white random glyphs in the wake, locks neon magenta. Diagonal art shimmer trimmed to single L→R pass; lock shimmer mirrors it on the tagline. Center alignment normalized at col 15.5 (border 26 dashes, art lead 5).
- fix(orphan-scan + validator): drop `merged:` frontmatter filter — any checkpoint file that exists is unmerged by definition (matches /wrapup behavior in plugin v2.2.0). Removes `readMergedField` from validator.
- chore(tests): update orphan-scan and validator tests for new behavior (legacy `merged: true` checkpoints now count as orphans).

## v2.1.5 — fix: doctor qmd-embeddings as advisory; orphan-scan independent of merged: field

- fix(doctor): mark qmd-embeddings auto-fix as advisory — plain `onebrain doctor` no longer nudges toward `--fix` for unembedded docs; embedding still runs when user explicitly invokes `--fix`
- fix(doctor): update unembedded hint to "Advisory: run /qmd embed when ready (or onebrain doctor --fix)"
- chore(types): add `advisory?: boolean` to internal `Fix` interface; `fixableCount` now excludes advisory fixes

## v2.1.4 — fix: drop bun-windows-arm64 (unsupported in bun v1.2)

- fix(release): remove `bun-windows-arm64` build target — unsupported in bun v1.2.x (regression from v2.1.3)
- fix(postinstall): remove `win32-arm64` from PLATFORM_MAP — falls back to JS bundle on Windows ARM64

## v2.1.3 — feat: postinstall binary download + full platform support

- feat(postinstall): `npm install -g` / `bun install -g` now downloads the correct platform-specific compiled binary automatically — no Bun installation required
- feat(release): add `bun-windows-arm64`, `bun-linux-x64-musl`, `bun-linux-arm64-musl` build targets — 8 platforms total
- feat(release): `npm-publish` now runs after `create-release` — ensures compiled binaries exist on GitHub Releases before postinstall downloads them
- fix(release): use `--target bun` in npm-publish step — JS bundle fallback for unsupported platforms
- fix(update): remove unused `daysBehind` function
- fix(biome): format validator.ts, cli-banner.ts, init.test.ts, cli-ui.ts

## v2.1.2 — fix: init fresh install layout + CI typecheck

- fix(init): peek plugin.json before step 4 — skip spinner on fresh install to prevent vault-sync clack output conflicting with setInterval \x1b[1A\x1b[2K
- fix(init): add dotLine() helper for completed-step output without a preceding spinner
- fix(vault-sync): add embedded mode — when called from init, uses makeStepFn (cyan bar, emoji steps) instead of clack intro/spinner/outro
- fix(vault-sync): add emoji to all steps (📥 📂 🔧 📌 🧹) for embedded mode
- fix(typecheck): spread pattern for optional hint/details in validator.ts (exactOptionalPropertyTypes)
- fix(typecheck): remove vaultDir from UpdateOptions usage in tests — field removed in binary-only refactor
- fix(typecheck): narrow patch-utf8.test.ts write signature to match implementation

## v2.1.1 — Post-merge fixes

- fix(encoding): change build target from `--target node` to `--target bun` — Node.js stream shim in bun bundles uses locale-dependent TTY write path that garbles UTF-8 multi-byte chars
- fix(encoding): write all UI output as `Buffer.from(str, 'utf8')` in cli-ui.ts and cli-banner.ts as defense-in-depth
- test(encoding): regression tests for patchUtf8 covering all write overloads and unicode chars
- fix(update): remove vault.yml guard — command now runs from any directory
- fix(init): add directory confirmation prompt in TTY mode before creating any files
- fix(init): injectable confirmFn for test isolation

## v2.1.0 — Redesign Install Flow

- feat(init): community plugin installer — downloads Tasks, Dataview, Terminal automatically
- feat(init): ASCII banner + picocolors UX redesign; cancel() on fatal vault-sync failure
- **BREAKING** change(update): binary-only — run `/update` skill in Claude to sync vault files
- remove(update): onebrain_version no longer written to vault.yml
- feat(doctor): intro/outro + clack UX; new checks (plugin-files, vault.yml-keys, settings-hooks)
- feat(doctor): --fix mode — auto-repair hooks, remove deprecated vault.yml keys; removes deprecated vault.yml keys (method, runtime.harness, onebrain_version)
- fix(register-hooks): PostToolUse auto-detected from qmd_collection; SessionStart removed
- remove: install.sh and install.ps1 — replaced by onebrain init
- feat(harness): replace CLAUDE_CODE_HARNESS with ONEBRAIN_HARNESS env var; shared detectHarness() utility detects harness at runtime via env → .gemini/ → .claude/ → direct
- remove(vault.yml): method and runtime.harness keys removed — harness detected at runtime, no longer stored

## v2.0.14 — fix: remove session token from hook emit format; deterministic resolveSessionToken

- fix(checkpoint): stop hook now emits `NN since <context>` instead of full filename — removes token from hook output, eliminates session token mismatch
- fix(session-init): day-scoped cache checked before process.ppid in resolveSessionToken — guarantees same token on re-run within the same day

## v2.0.13 — fix: remove backfill-recapped done flag

- fix(migrate): remove writeBackfillDoneFlag — session logs without recapped: are naturally candidates for /recap; no completion flag needed

## v2.0.12 — fix: auto-compact session log, session token mismatch; remove PreCompact hook

- fix(checkpoint): remove PreCompact subcommand — PostCompact resets the counter in all paths so PreCompact has no work to do
- fix(register-hooks): remove PreCompact from registered hooks; applyHooks deletes any stale PreCompact entry from settings.json on next /update
- fix(checkpoint): postcompact emits auto-wrapup block so Claude synthesizes session log from current context when no checkpoint files exist (Path B)
- fix(session-init): resolveSessionToken now checks $TMUX_PANE and $TERM_SESSION_ID before process.ppid — fixes token mismatch (#113) where session-init and stop hook spawn from different bash processes

## v2.0.11 — fix: remove unimplemented sandbox doctor check

- fix(doctor): remove `checkSandbox` — sandbox feature not yet implemented; the check produced a permanent warn for all vaults without benefit
- fix(types): remove `VaultSandbox` interface and `sandbox?: VaultSandbox` from `VaultConfig`
- test(doctor): replace sandbox-based warning fixtures with orphan-checkpoints warn in affected tests

## v2.0.10 — fix: doctor no longer warns on CLI-vs-plugin version difference

- fix(doctor): `checkVersionDrift` now compares `vault.yml onebrain_version` vs `plugin.json version` only — CLI binary version is on an independent release track and must not be compared against plugin files
- fix(doctor): remove `binaryVersion` param from `checkVersionDriftFn` signature — CLI version was never a valid input for plugin-track drift detection
- test(doctor): remove `binaryVersion forwarding` test suite — parameter no longer exists
- test(lib): remove `checkVersionDrift binary-vs-plugin warn` test case

## v2.0.9 — fix: register-hooks drops SessionStart and env, adds type/matcher to hook entries

- fix(register-hooks): remove SessionStart from registered hooks — session-init is run explicitly by agent startup, not via hook
- fix(register-hooks): add `type: "command"` and `matcher: ""` to new hook entries — missing type caused Claude Code settings validation error on every /update
- fix(register-hooks): remove applyPath / env.PATH writing — settings.json must not contain env block
- fix(register-hooks): remove hooks.json declaring SessionStart — eliminates duplicate hook registration
- test(register-hooks): update tests to assert SessionStart absent, type/matcher present, env absent
- feat(register-hooks): add --qmd / --remove-qmd flags for PostToolUse qmd-reindex hook management
- refactor(skills): replace all bash script calls with onebrain CLI (vault-sync, checkpoint reset, migrate, register-hooks --qmd)

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
