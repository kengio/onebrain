# OneBrain — Gemini CLI

OneBrain is a personal AI OS for Obsidian. INSTRUCTIONS.md is written using Claude Code
tool names — the mapping below translates them to Gemini CLI equivalents before the
shared instructions load.

## Load Order

1. **Tool mapping** — translates Claude Code tool names (`Read`, `Write`, `Bash`, etc.) to Gemini CLI equivalents (`read_file`, `write_file`, `run_shell_command`, etc.)
2. **Shared agent instructions** — vault structure, skills, session behavior, and personality

## Tool Name Mapping

@.claude/plugins/onebrain/references/gemini-tools.md

## Hooks & Slash Commands

`onebrain register-hooks` writes `.gemini/settings.json` with the `AfterAgent` lifecycle hook (Gemini equivalent of Claude's `Stop` — calls `onebrain checkpoint stop`). When `qmd_collection` is set in `vault.yml`, it also adds an `AfterTool` hook with matcher `Write|Edit` for `onebrain qmd-reindex`. Both hooks are wrapped to emit the JSON `{}` Gemini expects on stdout.

The same command copies pre-built slash command TOMLs from `.claude/plugins/onebrain/gemini/commands/` into `.gemini/commands/`. After running it, `/braindump`, `/capture`, `/research`, etc. are discoverable via Gemini's `/` menu.

To repair a broken setup (missing slash commands, stale hooks): re-run `onebrain register-hooks` from the vault root — it is idempotent.

## Agent Instructions

@.claude/plugins/onebrain/INSTRUCTIONS.md
