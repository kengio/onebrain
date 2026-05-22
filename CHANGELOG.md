---
latest_version: 3.0.3
released: 2026-05-22
---

# Changelog

All notable changes to the OneBrain plugin — i.e., any vault-deployed content (Claude plugin under `.claude/plugins/onebrain/`, Gemini config under `.gemini/`, future harness configs).
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

> **Versioning:** Plugin version is tracked in `plugin.json`. Bump when ANY harness config changes — skills, agents, hooks, INSTRUCTIONS, Gemini settings, slash commands, etc.
> For CLI binary changes, see the [`onebrain-ai/onebrain-cli`](https://github.com/onebrain-ai/onebrain-cli/blob/main/CHANGELOG.md) repository.

## v3.0.3 — 2026-05-22

- **perf(doctor): delegate the 8 schema-validation checks to `onebrain doctor --json`** — skill SKILL.md trimmed 290 → 205 lines (-29%). The skill now runs a single subprocess call for `vault.yml`, `vault.yml-keys`, `folders`, `plugin-files`, `settings-hooks`, `orphan-checkpoints`, `qmd-embeddings`, `claude-settings` (Rust-native, structured JSON). Skill-only checks (broken wikilinks, orphan notes, MEMORY.md size, inbox backlog, scheduler health, pause-thread state, memory health) remain in the skill — those are vault-content / state-machine checks the CLI doesn't cover.
- **fix(doctor): `--fix` flow delegates to `onebrain doctor --fix --json`** for CLI-side fix recipes (settings-hooks, plugin-files, vault.yml-keys, claude-settings, qmd). Skill `--fix` passes (wikilink fuzzy-match, MEMORY.md structure, confidence-score updates) remain skill-side via `references/autofix-procedures.md`.
- **chore: remove dead GitHub workflows** — `ci.yml` (`bun install` + `tsc --noEmit` + `biome check` + `bun test`) and `release.yml` (binary build via `bun build --compile` from `src/index.ts` + npm publish) targeted the v2.x TypeScript CLI code that was removed in v3.0.2. Plugin repo has no test/build surface anymore; CLI workflows live at [`onebrain-ai/onebrain-cli/.github/workflows/`](https://github.com/onebrain-ai/onebrain-cli/tree/main/.github/workflows). Resolves "next PR would fail CI on missing tsconfig/package.json/src" footgun.
- **No skill behavior changes** beyond /doctor — all other skills unchanged. CLI v3.0.0 floor pin retained (`requires.cli >=3.0.0`).

## v3.0.2 — 2026-05-22

- **chore: plugin-only trim** — this repo is now strictly the OneBrain plugin (skills, agents, hooks, INSTRUCTIONS, harness configs). The legacy v2.x TypeScript/Bun CLI source has been removed; the Rust CLI lives at [`onebrain-ai/onebrain-cli`](https://github.com/onebrain-ai/onebrain-cli) and ships from its own GitHub Releases.
- **rm Bun toolchain from repo root**: `src/`, `package.json`, `bun.lock`, `tsconfig.json`, `biome.json`. AGPL on the legacy code stays preserved in git history.
- **CHANGELOG split**: previous repo-root `CHANGELOG.md` was the legacy CLI changelog — removed. `PLUGIN-CHANGELOG.md` renamed to `CHANGELOG.md` (one changelog per repo per [`[[onebrain-changelog-structure]]`](../05-agent/memory/onebrain-changelog-structure.md)). All historical plugin entries preserved verbatim.
- **README update**: install instructions now point at the Rust CLI install paths (Homebrew tap, npm wrapper `@onebrain-ai/cli@3.0.0+`, GitHub Releases direct download, `onebrain update` self-installer). License badge MIT → AGPL-3.0-only (matches the [`v3.0.1` relicense](#v301--2026-05-22)).
- **GitHub Releases**: all 39 Bun-era releases (v2.0.0 → v2.3.3) and matching tags removed from this repo. The plugin repo no longer publishes Releases — the canonical Releases stream is [`onebrain-ai/onebrain-cli/releases`](https://github.com/onebrain-ai/onebrain-cli/releases).
- **No skill / hook / agent code changes** in this release — purely repo trim + manifest.

## v3.0.1 — 2026-05-22

- **chore: relicense MIT → AGPL-3.0-only** to align with the OneBrain CLI (`onebrain-ai/onebrain-cli`), which has shipped under AGPL since v3.0.0-alpha.0. Same license now spans the binary and the plugin manifest / skills / hooks that consume it, so the network-use copyleft (AGPL §13) applies consistently across the whole OneBrain runtime.
- **LICENSE**: replaced 21-line MIT text with the canonical 661-line GNU Affero General Public License v3.
- **plugin.json**: added `"license": "AGPL-3.0-only"` field. Previously absent; existing copies of the plugin (v2.x and v3.0.0) inherited the repo-root LICENSE — explicit field documents intent at the manifest level.
- **plugin.json**: bump `3.0.0` → `3.0.1` for the license-field addition (manifest change ⇒ version bump per repo convention).
- **MIT compatibility**: prior releases (v2.x through v3.0.0) remain available under MIT for downstream users who pinned to those versions. AGPL applies from v3.0.1 forward.
- **No skill / hook / agent code changes** in this release — purely the license + manifest update.

## v3.0.0 — 2026-05-22

- **feat(plugin.json): pin plugin to CLI v3.0+** — adds `requires.cli: ">=3.0.0"` field. Aligned with the OneBrain CLI v3.0.0 (Rust) GA shipped 2026-05-22. The pin in PR #180 was reverted in PR #181 because the CLI wasn't ready; this re-applies it now that v3.0.0 is live.
- **feat(hooks): SessionStart enforcement hook** — new `hooks/hooks.json` + `hooks/check-cli-version.sh` emits a `decision: block` JSON payload when the plugin boots alongside a CLI older than v3.0.0 (or no CLI on PATH); Claude Code refuses to start the session on that payload. Passes silently when v3.x is present. Pairs with the `requires.cli` field — the field is metadata for tooling, the hook is the runtime enforcement. Hook execution capped at 10 s via `timeout` in `hooks.json`.
- **chore(plugin.json): bump 2.4.14 → 3.0.0** — major-version break: this plugin release refuses to load against v2.x Bun-era CLIs. Existing v2.x users will see the SessionStart `decision: block` until they `onebrain update` (or reinstall via the new Homebrew tap / forthcoming npm wrapper).
- **Version comparison strategy**: hook extracts bare `MAJOR.MINOR.PATCH` via `grep -oE` (strips prerelease suffixes), then walks a pure-bash integer compare per field against the v3.0.0 floor. No dependency on GNU `sort -V` (absent from some older macOS BSD `sort` builds). Practical effect: any v3.0.0-alpha.x user passes (they're already on the Rust binary), only v2.x is blocked.
- **Distribution channels live at this release**: GitHub Releases (canonical, since v3.0.0 GA), Homebrew tap (`onebrain-ai/homebrew-onebrain` → `brew install onebrain-ai/onebrain/onebrain`), `onebrain update` self-installer.
- **What is NOT in this PR** (tracked for a follow-up plugin-trim PR per `[[onebrain-skill-design]]` single-responsibility): plugin repo README rewrite, trim to plugin-only (move CLI legacy `CHANGELOG.md` out of this repo), rename `PLUGIN-CHANGELOG.md` → `CHANGELOG.md`. Today's PR is scoped strictly to the pin + the runtime enforcement.

## v2.4.14 — 2026-05-20

- chore: revert the "pin plugin to CLI v3.0 (Rust)" PR (#180). Keeping the plugin compatible with both the Bun v2.3.3 CLI and the in-flight v3.0.0-alpha.* line until the Rust port reaches GA. The `requires.cli` pin will be re-applied (likely to `>=3.0.0`) once the CLI GA tag ships.
- Plugin version stays at 2.4.x; the previous bump to `3.0.0-alpha.1` in PR #180 was a leading-edge signal that turned out to be premature.

## v2.4.13 — 2026-05-19

- docs(update): add Known Gotcha about WebFetch returning summarized markdown — recommend `curl -fsSL` for raw-content fetches (`plugin.json`/`settings.json` JSON parsing, `PLUGIN-CHANGELOG.md` verbatim display, `SKILL.md` self-update bootstrap). Symptoms section helps diagnose silent corruption from summarized fetches.
- docs(update): add inline ⚠️ pointers at the four WebFetch call sites (version check, changelog display, SKILL.md bootstrap, settings.json merge) directing readers to the Known Gotcha when raw-content semantics matter — closes the "warning lives at the bottom but step prose says use WebFetch" coherence gap.

## v2.4.12 — 2026-05-13

- docs(INSTRUCTIONS): rewrite "Headless invocation" section to describe the real contract — scheduler now goes through `onebrain run-skill` which spawns `claude -p "/skill args" --add-dir <vault>` (the previous `claude --vault X --skill /name --headless` shape was never implemented on any binary; see CLI v2.3.3 for the fix)
- docs(INSTRUCTIONS): document `CLAUDE_BIN` env override for setups where `claude` is installed outside the probe list (`~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`)
- docs(INSTRUCTIONS): clarify that skill `args:` map values are appended as `key=value` tokens to the slash-command prompt and reach skills via Claude Code's standard ARGUMENTS slot

## v2.4.11 — 2026-05-12

- docs(doctor): update SKILL.md hook-check description to match new validator behavior — effective command = `command` joined with `args[]`, so canonical exec-form `{command: "onebrain", args: ["checkpoint", "stop"]}` is recognized alongside legacy shell form

## v2.4.10 — 2026-05-12

- feat(pause): new `/pause` skill saves snapshot of long-running work to `07-logs/pause/`; non-terminal — does not clear context
- feat(resume): new `/resume` skill loads active pause-thread state in fresh sessions; idempotent in same-session
- feat(wrapup): Step 0 detects active pause thread; "Yes" branch consolidates all pause files of slug + current checkpoints into one session log
- feat(wrapup, auto-summary): auto-finalize active pause thread before daily session log write (3 skip conditions prevent noise)
- feat(startup): banner shows `📂 active pause: {slug} ({N} snapshots)` when `_active.md` present
- feat(doctor): 3 new pause health checks (orphan pointer, missing pointer, idle > 14d)
- docs(instructions): wire `/pause` `/resume` into skills table, vault structure, file naming, routing, response profiles
- docs(session-formats): add Pause File Format + `synthesized_from_pause` session-log frontmatter case

## 2.4.9 — 2026-05-12

- `/schedule-add` Step 0 first-run preset selector — Minimal / Essentials / Maintenance Plus / Custom (E15-B)
- `/onboarding` adds preset selection step after agent identity setup (default = Essentials)
- Canonical preset tier definitions at `_shared/schedule-presets.md` — single source of truth
- Tier 3 preset mixes skill-mode and command-mode entries (live example of E15-A schema)
- INSTRUCTIONS.md + README + CONTRIBUTING document preset bundles

## 2.4.8 — 2026-05-12

- `/schedule-list` displays both skill-mode (`skill: /name (k=v)`) and command-mode (`cmd: binary arg1 arg2`) entries
- INSTRUCTIONS.md adds "Skill mode vs command mode" subsection with full YAML example
- README + CONTRIBUTING document command mode as alternative to thin wrapper skills
- Companion to CLI v2.3.1 which introduces the command-mode backend

## 2.4.7 — 2026-05-12

- 4 new wizard skills: `/schedule-add` (recurring), `/schedule-once` (one-shot), `/schedule-list`, `/schedule-remove` (E9.1)
- 26 user-facing skills declare `schedulable:` / `schedulable_with_args:` frontmatter — gates which skills the CLI scheduler accepts (E9.4)
- `/doctor` extended with Scheduler Health section: scans `.err.md` files, detects drift between `vault.yml` and installed plists, flags 3+ consecutive failures + expired one-shots (E9.2)
- INSTRUCTIONS.md adds "Scheduling — which tool to use" + "Headless invocation" sections (E9.3) — disambiguates OneBrain scheduler vs Claude Code `/loop` and `/schedule`
- `/help` MAINTAIN tier lists the 4 new schedule commands

## 2.4.6 — 2026-05-12

- Remove vault-author-specific references from plugin source for genericity
- /search: drop hardcoded `[projects_folder]/onebrain/plans/*.md` source; replace with generic `[projects_folder]/**/*.md` covering embedded specs/plans/design docs (keeps search coverage for projects with any folder layout)
- /search: replace hardcoded vault folder names with `[knowledge_folder]`/`[projects_folder]`/`[resources_folder]`/`[areas_folder]` placeholders; update progress line + frontmatter description to match
- /clone: replace personal example path with generic `/path/to/source/vault` in audit-log template
- /capture, /consolidate: replace concrete vault-author note paths in routing/moved examples with `[folder]/example/...` placeholders

## 2.4.5 — 2026-05-12

- Hot-fix: enforced English-only across /search per `onebrain-repo-english-only` rule
- Removed non-English auto-invoke triggers; kept 3 English: `search vault`, `find in vault`, `why did`
- Removed non-English example phrases and regex tokens from SKILL.md body + references + INSTRUCTIONS routing description
- Removed premature `schedulable` / `schedulable_with_args` / `required_args` frontmatter (defer to E9 scheduler shipping in a later PR)
- Bilingual user input still routes via agent's intent matching on the English description; non-English literals were redundant

## 2.4.4 — 2026-05-12

- New skill /search — general vault retrieval (E5)
- Answers both what + why questions across MEMORY/memory/sessions/plans/decisions logs/notes
- Uses qmd (lex+vec+hyde) with grep fallback
- Auto-invoke triggers: `search vault`, `find in vault`, `why did` (initial entry shipped with non-English triggers; hot-fixed in 2.4.5)
- Registered under 🔍 RECALL tier in /help

## 2.4.3 — 2026-05-12

- Added `## Progress reporting` section to 6 long-running skills (E3)
- Skills updated: /research, /consolidate, /distill, /reorganize, /connect, /import
- Format: `→ [step N/M] <action>` emitted at each major step
- Trust improvement during multi-step skill runs

## 2.4.2 — 2026-05-12

- /help reorganized into 4 Workflow tiers: 📥 INPUT · ⚙️ PROCESS · 🔍 RECALL · 🔧 MAINTAIN
- /onboarding moved from Maintain → Input (first run only)
- README skill list reordered to mirror tier structure
- Discoverability win for new users; existing users now see skills by phase

## [Unreleased]

## v2.4.1 — fix(qmd, /update): drop stale `--qmd` / `--remove-qmd` flags from docs

CLI dropped both `--qmd` and `--remove-qmd` from `onebrain register-hooks` in v2.1.0 (auto-detects from `vault.yml`'s `qmd_collection` instead — present registers the hook, absent strips it). Three plugin docs still told users and `/update` to pass these flags. On Windows after upgrading to CLI v2.2.1+, both `/update` and `/qmd uninstall` surfaced this as `unknown option` errors from commander.

- fix(skills/qmd/SKILL.md): Step 8 (`/qmd setup`) and Step 4b (`/qmd uninstall`) now run `onebrain register-hooks` (no flag); auto-detects from vault.yml.
- fix(skills/update/references/migration-steps.md): Step 6 merges the qmd-hook bullet into the unconditional `register-hooks` call — no separate `--qmd` invocation.

## v2.4.0 — feat(07-logs): subfolder restructure + per-skill log entries

Restructure `07-logs/` into 4 typed subfolders and add audit log entries for 12 skills. Companion CLI release v2.2.2 updates `orphan-scan` and the Stop hook's NN-counting helper to read from the new flat `checkpoint/` directory.

- feat(07-logs): split into `session/YYYY/MM/`, `checkpoint/` (flat), `update/` (flat), `log/YYYY/MM/`. Mental model: session/checkpoint = NN per run, everything else = append per day.
- feat(/update Step 0): idempotent migration moves files to the new layout (preserve YYYY/MM for session; flatten checkpoint + update). Detect-by-residual-files re-runs cleanly on interrupt.
- feat(startup): legacy structure detection nudges /update with a one-line banner; orphan-scan fallback auto-detects pre- vs post-v2.4.0 layout (multi-vault user safety).
- feat(skills): /recap, /distill, /memory-review, /learn, /consolidate, /connect, /reorganize, /onboarding, /qmd, /clone, /doctor, /weekly each write an audit log to `log/YYYY/MM/`. Shared `_shared/audit-log-format.md` reference deduplicates frontmatter + append-per-day algorithm + run-section heading + failure-mode rules.
- feat(audit-log frontmatter): canonical 3-field schema (`tags: [audit-log, X]`, `skill: /X`, `date: YYYY-MM-DD`) across all skill audit logs; per-skill discriminators (topic, subcommand, mode, path, version). Tag taxonomy unified — `[doctor-log]`, `[update-log]`, `[weekly-review]` flipped to the `[audit-log, X]` umbrella so a single Obsidian `tag:#audit-log` query surfaces every skill run.
- feat(session log + checkpoint frontmatter): `session_token: <token>` added to all 5 Session Log Format cases and the Checkpoint Format. Token previously lived only in checkpoint filenames; cross-referencing a session log to its checkpoints required parsing filenames. Now `rg "session_token: abc12345" 07-logs/` surfaces every artifact for that session.
- feat(/wrapup): orphan recovery reads flat `checkpoint/`, writes to `session/YYYY/MM/`. Cross-midnight handling simplified to filename-date math. Progress signal for N>3 orphan groups. CRLF-safe marker check.
- feat(/doctor): 07-logs structure check (verifies the 4 subfolders); housekeeping warning at >1000 log files. /reorganize now aborts if pre-v2.4.0 structure is detected (run /update first).
- fix(checkpoint-hook.sh + checkpoint.ts): both write to and read from flat `checkpoint/`. Pre-fix, NN counting was reading from legacy `YYYY/MM/` path → every checkpoint after migration would have collided at NN=01.
- fix(/update backup): `[archive_folder]/[agent_folder]/...` instead of hardcoded `05-agent` so users who remapped `folders.agent` see backups land in the matching subfolder.
- fix(migrate.ts runBackfillRecapped): walks `[logs_folder]/session/YYYY/MM/` post-v2.4.0 (was walking `[logs_folder]/YYYY/MM/` and silently skipping all session logs).

## v2.3.4 — docs(instructions): establish 11 iron-rule Working Principles

Promote `## Working Principles` in `INSTRUCTIONS.md` from 4 unnumbered guidelines to 11 numbered iron rules with a precedence-stating intro. These are non-negotiable defaults that apply across every session, every skill, every workflow — and explicitly take precedence over skill-specific instructions when in conflict. Synthesised from a 60+ memory audit, an insights-report friction analysis, and 29 reviewer-passes across 15 distinct role perspectives (writer, designer, student, PM, lawyer, doctor, therapist, teacher, sales, fiction author, financial analyst, journalist, founder, translator, dev) so the language survives universally — neither dev-jargon nor watered-down for technical work.

- docs(INSTRUCTIONS.md): convert `## Working Principles` to numbered list with intro stating these rules outrank skill-specific instructions when they conflict.
- docs(INSTRUCTIONS.md): new rules — *Speak in the user's vocabulary · Verify before asserting · Find the cause, not the symptom · Show a draft before extensive work · Update plan and task status in real time · Don't make the user wait · Update on evidence, not pressure · Carry changes through to related places.*
- docs(INSTRUCTIONS.md): rewrite original 4 rules per cross-role review — drop dev-only references (`AskUserQuestion`, slash-command exception list, "refactor"); merge "Surgical changes" into "Minimal footprint" with cleanup-after-yourself extension; add verifiable-criteria preference to "Define success".
- docs(INSTRUCTIONS.md): each rule body now includes register-matching, root-cause depth, draft-first for structural work, streaming-vs-background nuance, and explicit code-context coverage (callers, tests, types, migrations) — keeping rigor for dev users while staying accessible to writers, students, lawyers, clinicians, and operators.
- docs(INSTRUCTIONS.md): bullet 11 restructured per round-3 cross-role consensus — universal list (other notes, files that reference it, similar cases) leads, dev-specific examples fenced as `(in code: …)` so non-dev readers have a clear visual signal to skim past while dev users keep their precision.

## v2.3.3 — feat(wrapup): PR #156 follow-ups (configurable threshold + recovered-log marker + fallback row)

Three PR #156 follow-ups bundled. CLI track ships matching changes in v2.3.0 (see [CHANGELOG.md](CHANGELOG.md)).

- feat(wrapup/SKILL.md): Step 1b resolves `threshold_minutes = max(60, 2 * checkpoint.minutes)` from vault.yml once before scanning groups (was: hard-coded 60). Users who raised `checkpoint.minutes` to 60/90 now get a proportionally larger guard. Missing/malformed vault.yml falls back to 60-min default — recovery is critical-path, never block on config issues. Cross-link to the symmetric CLI helper documents the contract.
- feat(session-formats.md, wrapup/SKILL.md): standardise the `<!-- recovery-of: {token}:{date} -->` body marker for recovered session logs. The `already-recovered` short-circuit (Step 1b → step a) now matches via the marker instead of `case: recovered` frontmatter — version-independent, harness-independent, names the specific token+date pair so multi-group recovery logs short-circuit per group rather than as a whole.
- fix(wrapup/SKILL.md): the marker match is **anchored to start-of-line**, not bare substring. A session log that quotes the marker as documentation in mid-paragraph cannot trigger a false short-circuit (which would have destructively deleted checkpoints based on a documentation quote). Spec text in session-formats.md tightened in lockstep.
- fix(wrapup/SKILL.md): step (f) now re-reads the recovered session log and verifies the marker survived the write before falling through to step (g)'s checkpoint delete. If the marker is missing (LLM omission / partial write / encoding glitch), recovery aborts for that group: no delete, recovered-log path lands in `orphaned_recovered_logs`, and `skipped_active` records `marker_write_failed` for each file. This converts a silent destructive duplicate into an investigable skip.
- feat(wrapup/SKILL.md): new `marker_write_failed` enum value added to `skipped_active.reason` with its own row in the `{reason_summary}` rendering table.
- feat(wrapup/SKILL.md): `{reason_summary}` rendering table gets a catch-all fallback row for unmapped enum values. The surface signal stays generic so a missing explicit row is visible to the user and prompts contributors to add the proper mapping. Cross-linked to the enum definition at the top of Step 1b so future contributors who add a new `reason` value see both anchors.

## v2.3.2 — refactor(update): delegate CLI bump to `onebrain update`

`/update`'s "CLI Version Check" section was duplicating logic that the `onebrain update` CLI already owns: GitHub release lookup, package-manager detection, install, and binary validation. The skill now defers to the CLI as the single source of truth for the CLI bump.

- refactor(update/SKILL.md): replace 30-line "CLI Version Check" block (raw `npm view` + AskUserQuestion + per-shell bun/npm detection + `npm install -g` / `bun install -g`) with a 3-step delegation: probe `onebrain --version`, run `onebrain update`, surface non-zero exits.
- refactor(update/SKILL.md): drop the npm/bun selection prompt — `onebrain update` already picks `bun` on macOS/Linux and `npm` on Windows; user already consented to `/update` upstream, so a second AskUserQuestion is noise.
- docs(update/SKILL.md): add Known Gotcha — raw `npm install -g` / `bun install -g` calls are reserved for first-time CLI bootstrap (README/install scripts), never `/update`.
- note: pure SKILL.md change, no CLI/binary change. CLI version unchanged at 2.2.0.

## v2.3.1 — fix(wrapup): active-session guard prevents cross-harness checkpoint loss

Wrapup's orphan recovery (Step 1b) auto-recovered any non-current-token checkpoint into a synthesised session log and deleted the originals — including in-flight checkpoints belonging to a *different live harness* in the same vault. Closes the cross-harness contamination path observed when running Claude + Gemini concurrently.

- fix(wrapup/SKILL.md): add Active-Session Guard to Step 1b — for each orphan group, stat the newest checkpoint mtime; if `age_minutes < 60`, skip recovery (do not read, do not write a session log, do not delete) and surface in the Step 7 report as `skipped_active`.
- fix(wrapup/SKILL.md): explicit fail-safe — any stat error, unparseable mtime, or negative age forces skip-active. Destructive default on ambiguity is forbidden.
- fix(wrapup/SKILL.md): pre-delete re-stat in step 1b/f aborts the delete (and removes the just-written recovered log) if the owning session wrote a new checkpoint mid-recovery — closes the read→write→delete race.
- fix(wrapup/SKILL.md): exact `stat -f '%m'` (BSD) / `stat -c '%Y'` (GNU) commands spelled out so the LLM doesn't pick the wrong flag silently across platforms.
- fix(wrapup/SKILL.md): Step 7 `skipped_active` block is now MUST-emit (not soft-conditional) and renders `{path, age_minutes}` tuples — the user's only signal that a parallel harness owns checkpoints on disk.
- note: 60-minute threshold gives a buffer of two full auto-checkpoint windows (hook fires every 15 messages or 30 minutes). False-positives (idle but live sessions > 60 min) remain non-destructive — the owning user's next /wrapup consumes its own checkpoints.
- note: pure SKILL.md change, no CLI/binary change. CLI version unchanged at 2.2.0.

## v2.3.0 — feat(gemini): project-level `.gemini/` config alongside `.claude/`

Project-level `.gemini/` config ships alongside the Claude plugin so a single `onebrain init` (or `/update`) sets up both harnesses in the user's vault. Skills, agents, and INSTRUCTIONS stay single-source-of-truth in `.claude/plugins/onebrain/` — both harnesses reference them on demand, no duplication.

- feat(.gemini/settings.json): declarative hooks — `AfterAgent` (matcher `*`) → `onebrain checkpoint stop` (= Claude `Stop` parity); `AfterTool` (matcher `write_file|replace`, regex against Gemini's actual tool names) → `onebrain qmd-reindex` (= Claude `PostToolUse` parity). Both wrapped as `{cmd} > /dev/null 2>&1; echo '{}'` to satisfy Gemini's JSON-on-stdout protocol.
- feat(.gemini/settings.json): `model.disableLoopDetection: true` so legitimate multi-file skill activations (e.g. `/onebrain:help` reading SKILL.md + plugin.json + skills folder) don't trip Gemini's repetitive-tool-call heuristic.
- feat(.gemini/commands/onebrain): 25 hand-curated `.toml` slash commands under the `onebrain:` namespace (`/onebrain:braindump`, `/onebrain:capture`, ...). Namespacing avoids collisions with Gemini built-ins (`/help`, `/tasks`) and mirrors the Claude plugin path. Tab-complete on the suffix works (`/dail<tab>` → `/onebrain:daily`).
- note: this release establishes the unified-plugin policy — anything inside `.claude/plugins/onebrain/` OR `.gemini/` (or future harness configs) bumps the plugin track. CLI track (`package.json`) stays independent for TS source changes only.
- note: distribution — `vault-sync` (CLI v2.2.0+) auto-deploys `.gemini/` to the vault root alongside `.claude/plugins/onebrain/`. No manual install step required.

## v2.2.5 — fix: Windows skill + script compat (PowerShell / cmd / native Python)

Audit pass over every skill snippet that assumed Bash / Unix-only tooling. Closes #128, #129, #130.

- fix(open-in-obsidian.sh): use `cygpath -m` on MINGW/CYGWIN/MSYS to emit `C:/...` paths Obsidian accepts; percent-encode the URI so spaces and `#`/`&`/`?` in vault paths or filenames no longer truncate the launch (#130)
- fix(reading-notes): default filename template uses ` - ` instead of ` : ` so notes save on NTFS without truncation; gotcha note removed (#130)
- fix(import/markitdown-setup): drop the WSL-only gate on Windows; detect `python3` / `python` / `py -3` (and matching `pip` / `py -3 -m pip`) so native Windows installs can install markitdown (#128)
- fix(qmd setup): replace `openssl rand -hex 3` / `python3 -c …` with `node -e "…randomBytes(3)…"`; `basename` swapped for a Node one-liner — Node is portable and already required by the CLI (#128)
- fix(skills): cross-platform shell guidance — `which X || where X` for package detection; describe outcome (mkdir / mv / cp / rm / ls) so the model picks the shell-native form on PowerShell/cmd; drop `"$PWD"` from `onebrain vault-sync` (CLI defaults to cwd) (#129)
- fix(INSTRUCTIONS startup): replace `LC_ALL=en_US.UTF-8 grep -r …` with the Grep tool — UTF-8 handling is platform-correct and PowerShell can dispatch it (#129)
- fix(doctor SKILL): always strip trailing whitespace from vault.yml-derived paths (CRLF on Windows); normalize `installPath` separators before substring checks against the cache dir (#129)
- fix(skills/help, /onboarding, /learn): use `$HOME` / `$env:USERPROFILE` instead of the literal `~` for Glob/Read calls — the Glob tool does not expand tildes (#129)

## v2.2.4 — feat(update): backfill vault-side config drift after migration

- feat(/update SKILL): Step 8 now adds `update_channel: stable` to vault.yml when missing
- feat(/update SKILL): new Step 9 rewrites stale `extraKnownMarketplaces.onebrain.source.repo` (`kengio/onebrain` → `onebrain-ai/onebrain`) in vault `.claude/settings.json`

## v2.2.3 — fix: session-log glob across /wrapup, /daily, /weekly, /distill, /reorganize, INSTRUCTIONS

Same class of bug across multiple skills: globbing `[logs_folder]/.../*.md` matches checkpoint files (`*-checkpoint-*.md`) and `/update` migration logs (`*-update-*.md`) in addition to actual session logs. Tightened every affected pattern to `*-session-*.md` and added an inline note explaining why so it doesn't drift back.

- fix(/wrapup SKILL): Step 6 recap-reminder glob narrowed from `07-logs/YYYY/MM/*.md` to `*-session-*.md`. The bare `*.md` pattern was inflating the displayed unrecapped count (reporting 10 unrecapped when only 2 actual session logs were unrecapped).
- fix(/daily SKILL): Phase 1 "find most recent session log" glob narrowed to `*-session-*.md`. Previously a more recent checkpoint or `/update` log could be picked as "most recent", causing the briefing to read the wrong file.
- fix(/weekly SKILL): Step 1 weekly file list narrowed to `*-session-*.md` so the review doesn't include checkpoint or update logs.
- fix(/distill SKILL): Step 2 session-log search narrowed to `*-session-*.md` so non-session files in the logs folder don't contribute distillation content.
- fix(/reorganize SKILL): flat-root logs glob narrowed from `[logs_folder]/*.md` to `*-session-*.md` so a flat checkpoint or update log isn't treated as a legacy session log to migrate.
- fix(INSTRUCTIONS Recalling Information): Step 3 grep hint now specifies `**/*-session-*.md` so the agent doesn't default to bare `*.md` when searching past decisions.

## v2.2.2 — chore: migrate to onebrain-ai org

- chore(/update SKILL): raw GitHub URL templates updated to `onebrain-ai/onebrain` for plugin file fetches
- chore(plugin.json): version bump aligned with CLI v2.1.7 org migration
- note: existing vaults still work via GitHub auto-redirect; `/update` will pick up new URLs going forward

## v2.2.1 — fix: align with CLI v2.1.6 (Stop-hook-only)

- fix(INSTRUCTIONS): drop entire PostCompact section (Path A/B + auto-wrapup routing). Single dispatch row — `NN since <context>` → write checkpoint. Note added explaining why PostCompact + PreCompact are not registered
- feat(/wrapup + AUTO-SUMMARY): explicit **preservation rule** — deduplicate, don't summarize. Every unique decision, action item, learning, and topic must appear in the session log. No length cap. Heuristic: combined Key Decisions + Action Items + Open Questions length ≥ sum across all checkpoints
- fix(/doctor SKILL): hook check rewritten to allowed-events sweep (Stop + PostToolUse only); sample report shows stale-entry warnings instead of PostCompact-specific failure
- fix(session-formats.md): drop "PostCompact Path A/B" frontmatter case; keep "Recovered from checkpoints" for /wrapup orphan recovery
- fix(/wrapup SKILL.md): state-file note updated to 3-field `0:<epoch>:00`; PostCompact follow-up signal wording removed
- fix(/update migration-steps + SKILL): clarify Stop-hook-only registration; session-end synthesis is via AUTO-SUMMARY or manual /wrapup

## v2.2.0 — fix: PostCompact session log; simplify checkpoint cleanup; stronger qmd-first search

- fix(INSTRUCTIONS PostCompact): inline writes replace background-agent dispatch — Path B silently failed because background agents don't see the main agent's compacted context. Path A still consolidates leftover checkpoints + deletes them, identical to /wrapup.
- fix(wrapup + AUTO-SUMMARY): drop Step 5 (mark `merged: true`) and Step 6 safety-net scan. Checkpoints deleted directly after session log write verified — the log is the recovery proof.
- fix(session-formats): remove `merged: false` from checkpoint frontmatter template.
- fix(doctor): orphan-checkpoint check no longer reads `merged:` frontmatter — any leftover checkpoint is unmerged by definition.
- feat(INSTRUCTIONS + QMD.md): stronger qmd-first guidance — qmd is the explicit default for vault content searches; Grep reserved for non-content lookups.
- chore(memory-health-checks): drop the `merged: true` straggler row; ignore the field on legacy files.

## v2.1.0

- docs(onboarding): update install.sh reference → onebrain init; remove method/runtime.harness from vault.yml template
- docs(skills): remove method: onebrain from qmd and reorganize skill examples
- fix(doctor): --fix removes deprecated vault.yml keys (method, runtime.harness) in addition to onebrain_version

## v2.0.10 — fix: background agent checkpoint writes; updated hook reason format in INSTRUCTIONS

- fix(instructions): Auto Checkpoint routing now parses NN from hook reason; filename built from context session_token
- fix(instructions): stop hook and postcompact writes dispatched to background agent (mode: bypassPermissions) — main session no longer blocks on file writes
- fix(instructions): postcompact uses bare `auto-wrapup` reason; session_token sourced from context with session-init fallback
- fix(instructions): session-init failure explicitly aborts silently; routing table checks auto-wrapup reason first; Path A steps follow Path A dispatch (no longer split by Path B)

## v2.0.9 — fix: startup grep locale, postcompact routing, wrapup score-0 fallback

- fix(INSTRUCTIONS): startup task scan uses `LC_ALL=en_US.UTF-8` prefix on grep — prevents emoji pattern failures on macOS
- fix(INSTRUCTIONS): postcompact auto-wrapup Path A (step 9, after verify) and Path B now route action items to project notes — matches /wrapup Step 4b parity
- fix(wrapup): add session-context fallback in Step 4b-3b — score-0 tasks are routed to the project identified from `## What We Worked On` instead of being skipped; separate skipped_score0/skipped_ties lists
- fix(auto-summary): add session-context fallback for score-0 tasks in step 3 with explicit tokenization delimiters — matches /wrapup Step 4b-3b parity

## v2.0.8 — refactor: extract shared session formats; remove backfill-recapped from /update

- refactor(startup): add `skills/startup/references/session-formats.md` — canonical checkpoint + session log templates shared across all writers
- refactor(INSTRUCTIONS): replace inline checkpoint/session log format blocks with reference to session-formats.md
- refactor(wrapup): replace inline session log templates (Step 1b orphan recovery, Step 4) with reference to session-formats.md
- refactor(AUTO-SUMMARY): replace inline format description with reference to session-formats.md
- fix(update): remove migration Step 6 (backfill-recapped) — session logs without recapped: are naturally candidates for /recap, no backfill needed

## v2.0.7 — fix: postcompact Path B, remove PreCompact hook

- fix(INSTRUCTIONS): postcompact auto-wrapup adds Path B — when no checkpoint files exist, synthesize session log from current context (was a no-op, causing auto-compact to write nothing)
- fix(INSTRUCTIONS): checkpoint trigger now matches reason prefix — `since start` / `since checkpoint-NN` suffix no longer prevents file creation
- fix(INSTRUCTIONS): PreCompact is now a no-op and no longer registered; PostCompact resets counter in all paths
- fix(INSTRUCTIONS): remove merged:true write step from postcompact; simplify delete step
- fix(INSTRUCTIONS): update session_token tooltip to include $TMUX_PANE and $TERM_SESSION_ID priority
- fix(doctor): replace PreCompact required-check with stale-hook warning (🟡 suggest /update to remove)
- fix(update): migration-steps.md and SKILL.md updated to reflect Stop/PostCompact-only hook registration
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
