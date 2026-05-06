# OneBrain — Gemini CLI Extension

OneBrain is a personal AI OS for Obsidian. INSTRUCTIONS.md is written using Claude Code tool names — the mapping below translates them to Gemini CLI equivalents before the shared instructions load.

## Load Order

1. **Tool mapping** — translates Claude Code tool names (`Read`, `Write`, `Bash`, etc.) to Gemini CLI equivalents (`read_file`, `write_file`, `run_shell_command`, etc.)
2. **Shared agent instructions** — vault structure, skills, session behavior, and personality

## Tool Name Mapping

@references/gemini-tools.md

## Slash Commands

Slash commands are bundled inside this extension under `commands/*.toml` and discovered automatically by Gemini CLI. See `commands/` for the full set (e.g. `/braindump`, `/capture`, `/research`).

## Lifecycle Hooks

Declared in `hooks/hooks.json`:

- `AfterAgent` (matcher `*`) → `onebrain checkpoint stop` — auto-saves session state when the agent loop completes (mirrors Claude's `Stop` hook)
- `AfterTool` (matcher `Write|Edit`) → `onebrain qmd-reindex` — keeps the qmd search index fresh when notes change; no-ops when `qmd_collection` is unset in `vault.yml`

Both commands are wrapped as `{cmd} > /dev/null 2>&1; echo '{}'` to satisfy Gemini's JSON-on-stdout protocol.

## Agent Instructions

@INSTRUCTIONS.md
