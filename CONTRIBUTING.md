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

| Event | Fires when | Can block? |
|-------|-----------|------------|
| `PreToolUse` | Before a tool call executes | Yes |
| `PostToolUse` | After a tool call succeeds | No |
| `PostToolUseFailure` | After a tool call fails | No |
| `PermissionRequest` | When a permission dialog appears | Yes |
| `UserPromptSubmit` | When user submits a prompt, before Claude processes it | Yes |
| `Stop` | When Claude finishes responding | Yes |
| `StopFailure` | When turn ends due to an API error | No |
| `SessionStart` | When a session begins or resumes | No |
| `SessionEnd` | When a session terminates | No |
| `InstructionsLoaded` | When CLAUDE.md or `.claude/rules/*.md` files are loaded | No |
| `SubagentStart` | When a subagent is spawned | No |
| `SubagentStop` | When a subagent finishes | Yes |
| `PreCompact` | Before context compaction | No |
| `PostCompact` | After context compaction completes | No |
| `Notification` | When Claude Code sends a notification | No |
| `ConfigChange` | When a configuration file changes during a session | Yes |
| `WorktreeCreate` | When a worktree is being created | Yes |
| `WorktreeRemove` | When a worktree is being removed | No |
| `TeammateIdle` | When an agent team teammate is about to go idle | Yes |
| `TaskCompleted` | When a task is being marked as completed | Yes |
| `Elicitation` | When an MCP server requests user input during a tool call | Yes |
| `ElicitationResult` | After user responds to MCP elicitation | Yes |

Most hooks support a `matcher` field to filter by tool name or event subtype. `UserPromptSubmit`, `Stop`, `TeammateIdle`, `TaskCompleted`, `WorktreeCreate`, and `WorktreeRemove` fire on every occurrence and do not support matchers.

**Example — checkpoint system:** OneBrain's built-in `checkpoint-hook.sh` uses the `Stop` hook to auto-save session snapshots. It fires after every response, tracks message count + elapsed time against configurable thresholds, and writes a checkpoint file when either threshold is reached. State is kept in `/tmp/onebrain-{PPID}.state` (format: `COUNT:LAST_TS`) so the hook can accumulate counts across responses without forking a long-running process.

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

2. Create the corresponding script in `.claude/plugins/onebrain/hooks/`. Use `${CLAUDE_PLUGIN_ROOT}` to reference other files in the plugin directory. Write a single `.sh` script — it runs on macOS, Linux, and Windows (via Git Bash, which ships with Git for Windows). No `.ps1` variant is needed.

3. Make scripts defensive — they run on every matching event, so they should exit silently if there's nothing to do.

4. **Stop hooks must NOT use `"async": true`** — they inject prompts via `decision:block` written to stdout, which requires synchronous completion before Claude's next response. Async execution fires too late for prompt injection. PreCompact hooks do not support `decision:block` and cannot inject prompts.

5. **Stop and PreCompact hooks cannot be registered in `hooks.json`** — Claude Code does not fire them from plugin hook files. Register Stop/PreCompact hooks directly in the user's `~/.claude/settings.json` instead. Only `PostToolUse`, `UserPromptSubmit`, and similar event hooks work from `hooks.json`.

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
