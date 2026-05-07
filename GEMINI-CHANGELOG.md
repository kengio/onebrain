---
latest_version: 1.0.0
released: 2026-05-07
---

# Gemini Integration Changelog

All notable changes to OneBrain's Gemini CLI integration at `.gemini/`.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

> **Versioning:** Tracked in `.gemini/settings.json` `onebrain.version`. Bump only when files inside `.gemini/` change (settings, commands, hook config).
> For CLI binary changes see [CHANGELOG.md](CHANGELOG.md). For plugin changes see [PLUGIN-CHANGELOG.md](PLUGIN-CHANGELOG.md).

## [Unreleased]

## v1.0.0 — Initial Gemini CLI integration

Project-level `.gemini/` config ships alongside the Claude plugin so a single `onebrain init` (or `/update`) sets up both harnesses in the user's vault. Skills, agents, and INSTRUCTIONS stay single-source-of-truth in the plugin tree — both harnesses reference them on demand.

- feat(.gemini/settings.json): declarative hooks — `AfterAgent` (matcher `*`) → `onebrain checkpoint stop` (= Claude `Stop` parity); `AfterTool` (matcher `write_file|replace`, regex against Gemini's actual tool names) → `onebrain qmd-reindex` (= Claude `PostToolUse` parity). Both wrapped as `{cmd} > /dev/null 2>&1; echo '{}'` to satisfy Gemini's JSON-on-stdout protocol.
- feat(.gemini/settings.json): `model.disableLoopDetection: true` so legitimate multi-file skill activations (e.g. `/onebrain:help` reading SKILL.md + plugin.json + skills folder) don't trip Gemini's repetitive-tool-call heuristic.
- feat(.gemini/settings.json): top-level `onebrain.version` field — independent third version track, machine-readable for drift detection by `/doctor` / `/update` follow-ups.
- feat(.gemini/commands/onebrain): 25 hand-curated `.toml` slash commands under the `onebrain:` namespace (`/onebrain:braindump`, `/onebrain:capture`, ...). Namespacing avoids collisions with Gemini built-ins (`/help`, `/tasks`) and mirrors the Claude plugin path. Tab-complete on the suffix works (`/dail<tab>` → `/onebrain:daily`).
- note: distribution — `vault-sync` (CLI v2.2.0+) auto-deploys `.gemini/` to the vault root alongside `.claude/plugins/onebrain/`. No manual install step required.
