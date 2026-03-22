# Contributing to OneBrain

Thanks for your interest in contributing. This document covers how the project is structured and how to submit changes.

## What to Contribute

Good contributions include:

- New slash commands (skills)
- Improvements to existing skills — clearer instructions, better prompts, edge case handling
- Bug fixes in install scripts
- README and documentation improvements
- Support for additional AI agents

## Project Structure

```text
.claude/plugins/onebrain/
├── .claude-plugin/
│   └── plugin.json      Plugin manifest (name, version, description)
├── skills/          One directory per slash command
│   └── [name]/
│       └── SKILL.md     The skill prompt — what the AI follows when invoked
├── hooks/           Automated behaviors (session start, session end)
└── agents/          Specialized subagents
```

Skills are plain Markdown files. The AI reads them at runtime — no compilation or build step.

## Adding a New Skill

1. Create `.claude/plugins/onebrain/skills/[skill-name]/SKILL.md`
2. Add YAML frontmatter:

   ```yaml
   ---
   name: skill-name
   description: One-line description of what this skill does
   ---
   ```

   No `triggers:` field is needed. Skill routing is handled by the command tables in `CLAUDE.md`, `GEMINI.md`, and `AGENTS.md` — register your command there (see step 4).

3. Write the skill as a numbered sequence of steps the AI should follow
4. Register the command in `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, and `README.md`

## Editing an Existing Skill

- Keep the frontmatter intact
- Prefer adding steps over removing them — removals can break workflows users depend on
- Test manually: open a vault, invoke the command, follow it through

> **Important:** `skills/onboarding/SKILL.md` and `skills/update/SKILL.md` are intentionally excluded from the folder-name replacements that run during onboarding and update.
>
> `skills/onboarding/SKILL.md` must always contain the default OneBrain folder names (`00-inbox/`, `01-projects/`, `02-knowledge/`, `03-archive/`, `04-logs/`) as hardcoded strings — these are the source patterns the replacement instructions match against. Changing them breaks method customization for all users.
>
> `skills/update/SKILL.md` must likewise not be pre-replaced. Its Step 5.5 uses the same default folder names as hardcoded source strings to match against fresh upstream content. Do not alter them — doing so will break re-application for users on PARA or Zettelkasten.

## Install Scripts

- `install.sh` — bash, targets macOS and Linux
- `install.ps1` — PowerShell 5+, targets Windows

Both scripts download the repo tarball, extract it, remove themselves from the vault, and install community plugins. Keep them simple — vault setup belongs in `/onboarding`, not here.

## Pull Request Guidelines

- One logical change per PR
- Include a brief description of what changed and why
- If adding a skill, show an example interaction in the PR description
- Keep skill files readable — they're prompts, not code

## Reporting Issues

Open a GitHub issue with:

- What you expected to happen
- What actually happened
- Which AI agent you were using (Claude Code, Gemini CLI, etc.)
- Relevant skill output if applicable
