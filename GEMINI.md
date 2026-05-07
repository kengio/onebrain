# OneBrain — Gemini CLI

OneBrain is a personal AI OS for Obsidian. INSTRUCTIONS.md is written using Claude Code
tool names — the mapping below translates them to Gemini CLI equivalents before the
shared instructions load.

## Load Order

1. **Tool mapping** — translates Claude Code tool names (`Read`, `Write`, `Bash`, etc.) to Gemini CLI equivalents (`read_file`, `write_file`, `run_shell_command`, etc.)
2. **Shared agent instructions** — vault structure, skills, session behavior, and personality

## Project-Level Gemini Config

Hooks and slash commands are defined at the project root in `.gemini/`:

- `.gemini/settings.json` — declarative hooks (`AfterAgent` → `onebrain checkpoint stop`, `AfterTool` for `write_file|replace` → `onebrain qmd-reindex`; both wrapped to satisfy Gemini's JSON-on-stdout protocol), `model.disableLoopDetection: true` so legitimate multi-file skill activations don't trip Gemini's repetitive-tool-call heuristic, and `_onebrain.version` (independent OneBrain Gemini-integration track — bumps when `.gemini/` semantics change, separate from CLI/plugin tracks)
- `.gemini/commands/onebrain/*.toml` — 25 user-facing slash commands under the `onebrain:` namespace (`/onebrain:braindump`, `/onebrain:capture`, `/onebrain:research`, ...) that activate the matching skill. Namespacing avoids collisions with Gemini built-ins (`/help`, `/tasks`) and mirrors the Claude plugin path (`.claude/plugins/onebrain/`)

Skills, agents, INSTRUCTIONS, and tool-mapping references all live inside the Claude plugin tree at `.claude/plugins/onebrain/...`. The agent reads them on demand via the paths referenced from each TOML's prompt — no duplication needed.

## Tool Name Mapping

@.claude/plugins/onebrain/references/gemini-tools.md

## Agent Instructions

@.claude/plugins/onebrain/INSTRUCTIONS.md
