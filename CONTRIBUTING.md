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
.claude-plugin/                          Root marketplace config
└── marketplace.json                     Registers plugins for Claude

.claude/plugins/onebrain/                Main plugin directory
├── .claude-plugin/
│   └── plugin.json                      Plugin manifest (name, version, description)
├── INSTRUCTIONS.md                      Agent instructions — loaded by CLAUDE.md/GEMINI.md/AGENTS.md
├── skills/                              One directory per slash command (18 skills)
│   └── [name]/
│       └── SKILL.md                     The skill prompt — what the AI follows when invoked
├── hooks/
│   └── hooks.json                       Hook configuration (session automation)
└── agents/
    └── knowledge-linker.md              Knowledge graph agent (used by /connect)
```

Key files: [marketplace.json](.claude-plugin/marketplace.json) · [plugin.json](.claude/plugins/onebrain/.claude-plugin/plugin.json) · [INSTRUCTIONS.md](.claude/plugins/onebrain/INSTRUCTIONS.md) · [hooks.json](.claude/plugins/onebrain/hooks/hooks.json)

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

   No `triggers:` field is needed. Skill routing is handled by the command table in [INSTRUCTIONS.md](.claude/plugins/onebrain/INSTRUCTIONS.md) — register your command there (see step 4).

3. Write the skill as a numbered sequence of steps the AI should follow
4. Register the command in [INSTRUCTIONS.md](.claude/plugins/onebrain/INSTRUCTIONS.md) and [README.md](README.md) (also increment the command count in the README feature list)

## Editing an Existing Skill

- Keep the frontmatter intact
- Prefer adding steps over removing them — removals can break workflows users depend on
- Test manually: open a vault, invoke the command, follow it through

## Adding a New Agent

Agents are specialized subprocesses invoked by skills for focused, autonomous tasks. The existing example is [`knowledge-linker.md`](.claude/plugins/onebrain/agents/knowledge-linker.md), used by `/connect`.

1. Create `.claude/plugins/onebrain/agents/[agent-name].md`
2. Add YAML frontmatter:

   ```yaml
   ---
   name: Agent Display Name
   description: One-line description — when this agent should be invoked
   color: blue
   ---
   ```

   Supported colors: `blue`, `green`, `red`, `yellow`, `purple`, `orange`.

3. Write the agent's system prompt — its role, process, and output format
4. Invoke the agent from a skill using the Agent tool, passing it the task context

Agents are stateless — they receive context from the invoking skill and return a result. Keep them focused on a single task.

## Adding a New Hook

Hooks run shell commands automatically when Claude performs certain actions. Hook configuration lives in [`hooks.json`](.claude/plugins/onebrain/hooks/hooks.json). Shell scripts go in the same `hooks/` directory.

**Available hook events:**

| Event | Fires when |
|-------|-----------|
| `PostToolUse` | After any tool call (filterable by tool name) |
| `PreToolUse` | Before any tool call (can block execution) |
| `Stop` | When Claude finishes responding |
| `SessionStart` | At the start of a new session |

**To add a hook:**

1. Add an entry to [hooks.json](.claude/plugins/onebrain/hooks/hooks.json):

   ```json
   {
     "hooks": {
       "PostToolUse": [
         {
           "matcher": "Write|Edit",
           "hooks": [
             {
               "type": "command",
               "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/your-hook.sh\"",
               "async": true
             }
           ]
         }
       ]
     }
   }
   ```

2. Create the corresponding script in `.claude/plugins/onebrain/hooks/`. Use `${CLAUDE_PLUGIN_ROOT}` to reference other files in the plugin directory. For cross-platform support, provide both `.sh` (macOS/Linux) and `.ps1` (Windows) variants and chain them with `||`.

3. Make scripts defensive — they run on every matching tool call, so they should exit silently if there's nothing to do.

## Install Scripts

- [`install.sh`](install.sh) — bash, targets macOS and Linux
- [`install.ps1`](install.ps1) — PowerShell 5+, targets Windows

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
