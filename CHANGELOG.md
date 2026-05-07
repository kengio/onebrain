---
latest_version: 2.3.0
released: 2026-05-07
---

# CLI Changelog

All notable changes to the OneBrain CLI binary (`@onebrain-ai/cli`).
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

> **Versioning:** CLI version is tracked in `package.json`. Bump only when TypeScript source changes.
> For plugin changes (skills, agents, hooks, INSTRUCTIONS), see [PLUGIN-CHANGELOG.md](PLUGIN-CHANGELOG.md).

## [Unreleased]

## v2.3.0 — fix(orphan-scan): symmetric 60-min Active-Session Guard

Companion to plugin v2.3.1's /wrapup Step 1b mtime guard (PR #156). The startup banner's `onebrain orphan-scan` previously surfaced cross-harness in-flight checkpoints as orphans even though /wrapup correctly refused to recover them — confusing UX loop where the banner advertised orphans the recovery skill would skip. CLI now applies the identical 60-min mtime window so banner and recovery agree.

- fix(orphan-scan): groups whose newest checkpoint mtime is < 60 min old are NOT counted — they belong to a still-active session in another harness. Cross-month token groups are merged before the guard runs, so globally-newest mtime wins (not per-month).
- fix(orphan-scan): fail-safe on stat error / clock skew / negative age — group is treated as ambiguous and skipped, never partially counted.
- test(orphan-scan): 7 new cases — boundary 30/60/90 min, newest-mtime-wins, future-mtime fail-safe, cross-month globally-newest, mixed stale+active groups.

## v2.2.0 — feat(vault-sync): deploy `.gemini/` project config alongside the plugin

Companion to plugin v2.3.0. `.gemini/` (Gemini's project-level settings + slash commands) now lives at the same level as `.claude/` and ships through the same release artifact, so a single `onebrain init` or `/update` sets up both Claude and Gemini in the user's vault — no harness picker, no manual extension link.

- feat(vault-sync): new `syncGeminiConfig` step copies `.gemini/` from the extracted release tarball into the vault root, mirroring the plugin-folder semantics (full mirror, stale entries swept). Best-effort: silently skipped when the tarball predates the `.gemini/` shipping cutoff.
- chore(register-hooks): remove the legacy `registerGeminiHooks` helper that wrote a Claude-shaped `Stop` hook into any pre-existing `.gemini/settings.json`. Gemini hooks now come from the bundled `.gemini/settings.json` declaratively — the CLI does not mutate user-owned settings. Existing leftover `Stop` entries from earlier versions become harmless dead config (Gemini ignores `Stop`; it fires `AfterAgent` instead).
- test(vault-sync): 3 new cases — `.gemini/` deploy from tarball, stale-file sweep on resync, missing-source-tree silent no-op.
- test(register-hooks): replace the gemini Stop-write tests with two no-op assertions — register-hooks does not touch user-owned `.gemini/settings.json` and does not create one when absent.

## v2.1.16 — test(cli-banner): smoke tests for static-banner exit paths

- test(cli-banner): assert `printBanner()` resolves under 250ms in both non-TTY and TTY-without-truecolor modes — guards both early-return branches against regressions where animation accidentally runs in CI/piped/16-color contexts

## v2.1.15 — fix(vault-sync, register-hooks): Windows + iCloud reliability

- fix(vault-sync): set `TAR_OPTIONS=--force-local` on win32 so MSYS/Git Bash GNU tar stops parsing `C:\…` vault paths as `host:path` and the extraction completes (#126)
- fix(vault-sync, register-hooks, init): swallow EEXIST from `mkdir({ recursive: true })` when the path is already a directory — covers the iCloud-Drive-on-Windows quirk where `mkdir` throws despite the recursive flag; non-EEXIST errors and EEXIST-on-a-file still propagate (#126)
- new(lib): `mkdirIdempotent` helper in `@onebrain/core` — single shared EEXIST-tolerant `mkdir` used by all CLI write paths, replacing four ad-hoc `mkdir({ recursive: true })` call sites
- test: 4 new cases for `mkdirIdempotent` (fresh dir, idempotent, EEXIST-on-file rethrow, EACCES rethrow) and 4 for `buildTarSpawnEnv` (darwin/linux passthrough, win32 sets `--force-local`, win32 overrides user-set `TAR_OPTIONS`)

## v2.1.14 — fix(register-hooks): migrate legacy `qmd update -c …` PostToolUse entries

- fix(register-hooks): rewrite legacy `qmd update <args>` PostToolUse hooks to canonical `onebrain qmd-reindex` so `/doctor`'s substring check no longer flags working hooks as missing (#127)
- fix(register-hooks): match wrapped legacy forms too (`powershell.exe ... qmd update -c …`, `bash -lc 'qmd update …'`) so older Windows installs migrate cleanly
- fix(register-hooks): dedupe canonical entries after migration and normalize the parent group's matcher to `Write|Edit`, so a settings.json with both legacy and canonical hooks doesn't end up firing the reindex twice
- fix(register-hooks): strip legacy `qmd update …` entries when `qmd_collection` is unset in vault.yml (instead of leaving them firing against a collection the user no longer maintains)
- fix(register-hooks): status line reports `PostToolUse migrated` (with `↑` icon in TTY) instead of conflating into `added`/`ok`
- test(register-hooks): 12 new cases — migration, idempotence, dedup (with and without legacy entries present), narrow-matcher normalization, PowerShell-wrapped legacy form, qmd-disabled cleanup with mixed legacy + canonical

## v2.1.13 — fix(session-init): walk process tree to find claude PID

- fix(session-init): walk parent chain to resolve the claude ancestor PID, matching what the bash hook's `$PPID` already sees
- fix(session-init): eliminate token collisions across Claude sessions on terminals that set no session env vars (notably Obsidian terminal plugin on macOS) — every session now gets a distinct token instead of sharing the day-scoped cache
- refactor(session-init): inject a `ProcLookup` into `resolveSessionToken` / `runSessionInit` for deterministic walk-up tests
- test(session-init): add unit coverage for `findClaudeAncestorPid` (chain walk, basename + `.exe` strip, depth bound, cycles) and walk-up integration in `resolveSessionToken`

## v2.1.12 — fix(vault-sync): registry matching by projectPath + test isolation

- fix(vault-sync): broaden per-vault registry match — fall back to projectPath when installPath is stale (#147)
- fix(vault-sync): on projectPath fallback, rewrite stale installPath to canonical vaultPluginDir (#147)
- fix(vault-sync): inject `installedPluginsPath` option so tests don't pollute real `~/.claude/plugins/installed_plugins.json` (#146)
- fix(init): same `installedPluginsPath` injection (#146)
- test(vault-sync): cover stale-installPath + matching-projectPath case
- test: assert real registry is byte-identical before/after `bun test`

## v2.1.11 — feat(doctor + vault-sync): backfill vault-side config drift

- feat(validator): downgrade missing `update_channel` from error → warning (#133)
- feat(validator): warn on stale `extraKnownMarketplaces.onebrain.source.repo: kengio/onebrain` in vault `.claude/settings.json`
- feat(doctor --fix): auto-add `update_channel: stable` to vault.yml (#133)
- feat(doctor --fix): auto-rewrite stale `extraKnownMarketplaces.onebrain.source.repo` → `onebrain-ai/onebrain` in vault `.claude/settings.json`
- feat(vault-sync): write `lastUpdated` to `installed_plugins.json` entry after pin (#132)
- feat(vault-sync): dedup orphan `onebrain@onebrain` entries whose `projectPath` is missing (#132)
- test(doctor): cover new validator severity + auto-fix behavior
- test(vault-sync): cover lastUpdated write + orphan dedup

## v2.1.10 — fix: whitelist `-session-` infix in orphan-scan + migrate filters

Companion to plugin v2.2.3. Two CLI sites had the same bug class — blacklisting `-checkpoint-` and accepting any other date-prefixed `.md` file in the logs folder, which let `/update` migration logs (`YYYY-MM-DD-update-vX.Y.Z.md`) and `/weekly` review files (`YYYY-MM-DD-weekly.md`) fall through.

- fix(orphan-scan): `hasManualSessionLog` filter switched to whitelist (`includes('-session-')`). Previously an update or weekly file sharing a date with an orphan checkpoint silently suppressed the orphan count — `runOrphanScan` would report `orphan_count: 0` even though the orphan was real.
- fix(migrate.runBackfillRecapped): same whitelist switch. The blacklist version was rewriting frontmatter on every non-checkpoint `.md` file in the logs folder, silently injecting a meaningless `recapped: <today>` field into update logs and weekly reviews.
- test(orphan-scan): three regression cases — orphan still counts when only an update-log or weekly file exists for the date; orphan still skipped when both a non-session log AND a real session log exist on the same date.
- test(migrate): two regression cases — update-log frontmatter and weekly-review frontmatter are left untouched (idempotent reads, byte-equal contents, no `recapped:` field injected).

## v2.1.9 — feat: brand-aligned CLI banner (neural-mesh brain + slant wordmark + brand gradient)

- feat(cli-banner): redesign banner — figlet "big" font camelcase "OneBrain" wordmark, alone (no borders, no logo); the wordmark itself is the brand mark and the animation canvas. Compact 6-row footprint keeps every command's banner output cheap on terminal real estate
- feat(cli-banner): canonical uppercase tagline "YOUR AI THINKING PARTNER" + secondary subtitle "A unified intelligence in your Obsidian vault" rendered as a faint cyan layered tagline below the primary line
- feat(cli-banner): replace full-hue rainbow with a 3-stop magenta → mid-pink → cyan brand gradient (matches the SVG brain logo's stops); animation paints directly on the wordmark — every glyph cell takes its own gradient color along the diagonal sweep, with the white shimmer settling each cell back to its gradient color
- feat(cli-banner): non-interactive output (piped, redirected, CI logs) now prints a static brand-colored banner instead of nothing — truecolor host paints brand RGB, 16-color falls back to `pc.cyan`; animation only runs when stdout is an interactive TTY with truecolor
- fix(cli-banner): brand colors now align with website CI — `PREFIX_COLOR` `[0,243,255]` (#00f3ff), `TRAILING_COLOR` `[255,45,146]` (#ff2d92); shimmer trail settles on brand cyan, subtitle uses brand cyan dimmed along its own hue axis, dim-state stays inside the cyan family
- fix(cli-banner): honor `FORCE_COLOR=3` / `ONEBRAIN_FORCE_TTY=1` overrides for stdout-isTTY detection — partial fix for #131 (Git Bash MinTTY on Windows); animation now reachable for users whose terminals under-report TTY-ness
- test(cli-banner): new `cli-banner.test.ts` covers non-TTY static path (asserts brand RGB, no animation, no cursor toggling), TTY-without-truecolor 16-color fallback (asserts uppercase tagline + subtitle ordering), and brand-color exports

## v2.1.8 — chore: point npm `homepage` to onebrain.run

- chore(package.json): `homepage` field updated from `github.com/onebrain-ai/onebrain` → `https://onebrain.run` so npm registry links to the marketing site
- note: `repository.url` and `bugs` still point to GitHub (correct for npm metadata)

## v2.1.7 — chore: migrate to onebrain-ai org

- chore: GitHub repo transferred from `kengio/onebrain` to `onebrain-ai/onebrain` — npm `@onebrain-ai/cli` package unchanged
- chore(package.json): update `homepage`, `repository.url`, `bugs` URLs to new org
- chore(postinstall): release binary download URL points to onebrain-ai/onebrain
- chore(vault-sync): tarball API URL + extracted folder prefix (`onebrain-ai-onebrain-<sha>`) updated; tests aligned
- chore(update): `GITHUB_REPO` constant points to onebrain-ai org
- chore(README): badge URLs updated to new org
- note: existing GitHub URLs auto-redirect — no breaking change for users with current install

## v2.1.6 — fix: drop PostCompact hook; trust Stop hook threshold

- fix(checkpoint): drop PostCompact hook entirely (Claude Code spec: stdout doesn't reach the agent). Stop hook is now the only checkpoint signal — its existing 15-msg / 30-min threshold drives emission across compacts without special handling
- changed(checkpoint): state file is strictly 3 fields (`count:last_ts:last_stop_nn`). Legacy 4-field (`pending_checkpoint` / `pending_stub`) and v1 2-field files reset to `0:0:00` on first read — costs at most one checkpoint cycle
- changed(register-hooks + doctor): generalized stale-hook sweep — allowed events are `Stop` + `PostToolUse` only. Any onebrain-* command under any other event (PreCompact, PostCompact, UserPromptSubmit, etc.) is auto-removed on `/update` and `/doctor --fix`. User-added non-onebrain entries preserved
- removed(checkpoint): `handlePostcompact`, `postcompactFallback`, `'postcompact'` dispatch, `pending_checkpoint` field, `PRECOMPACT_RECENCY` + `PENDING_CHECKPOINT_TTL_SECONDS` constants, post-compact branch in `handleStop`
- feat(checkpoint): atomic write-rename for state writes (pid-suffixed temp + POSIX rename) — prevents torn reads
- perf(checkpoint): skip `findVaultRoot` for `reset` mode — touches $TMPDIR only

## v2.1.5 — feat: cyberpunk banner v2 + checkpoint cleanup consistency

- feat(cli-banner): 3-phase banner intro — white CRT scan ↓ (hold 600ms), diagonal rainbow flow ↗, white shimmer ↗.
- feat(cli-banner): rotating tagline via wipe-swap — `Remembers You` → `Catches Insights` → `Thinking Partner`. Prefix cyan, trailing magenta; final shimmer burns trailing to all-cyan settle.
- feat(cli-banner): center alignment normalized at col 15.5 (border 26 dashes, art lead 5); static no-truecolor fallback uses signature line in cyan.
- fix(doctor): qmd-embeddings auto-fix marked advisory — plain `doctor` no longer nudges toward `--fix`; `--fix` still embeds. New `advisory?: boolean` on internal Fix interface.
- fix(orphan-scan + validator): drop `merged:` filter to match plugin v2.2.0 — any leftover checkpoint is unmerged by definition. `readMergedField` removed.
- fix(doctor --fix): bar-pattern visual cleanup — "Nothing to fix" flush-left; multi-fix opens own `┌` group (new `barOpen` helper).
- chore(tests): orphan-scan + validator tests reframed — legacy `merged: true` now counts as orphan.

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

- **BREAKING** change(update): binary-only — run `/update` skill in Claude to sync vault files; install.sh / install.ps1 removed (replaced by `onebrain init`).
- feat(init): community plugin installer (Tasks, Dataview, Terminal) + ASCII banner + picocolors UX; cancel() on fatal vault-sync failure.
- feat(doctor): intro/outro + clack UX; new checks (plugin-files, vault.yml-keys, settings-hooks); `--fix` auto-repairs hooks and removes deprecated keys.
- feat(harness): replace `CLAUDE_CODE_HARNESS` with `ONEBRAIN_HARNESS`; shared `detectHarness()` resolves runtime via env → `.gemini/` → `.claude/` → direct.
- fix(register-hooks): PostToolUse auto-detected from `qmd_collection`; SessionStart removed.
- remove(vault.yml): drop deprecated `method`, `runtime.harness`, `onebrain_version` — harness detected at runtime, version comes from package.json.

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
