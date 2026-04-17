# Contributing to OneBrain

Thanks for your interest in contributing. This document covers how the project is structured and how to submit changes.

## What to Contribute

Good contributions include:

- New slash commands (skills)
- New background agents (focused autonomous tasks dispatched by skills)
- Improvements to existing skills — clearer instructions, better prompts, edge case handling
- Bug fixes in install scripts
- README and documentation improvements

## Project Structure

```text
.claude-plugin/                          Root marketplace config
└── marketplace.json                     Registers plugins for Claude

.claude/plugins/onebrain/                Main plugin directory
├── .claude-plugin/
│   └── plugin.json                      Plugin manifest (name, version, description)
├── INSTRUCTIONS.md                      Agent instructions — loaded by CLAUDE.md/GEMINI.md/AGENTS.md
├── skills/                              One directory per slash command (24 skills)
│   └── [name]/
│       └── SKILL.md                     The skill prompt — what the AI follows when invoked
├── hooks/
│   └── hooks.json                       Hook configuration (session automation)
└── agents/
    ├── knowledge-linker.md              Knowledge graph agent (used by /connect)
    ├── link-suggester.md                Auto-add wikilinks after note creation (used by /learn)
    ├── tag-suggester.md                 Auto-add tags from vault vocabulary (used by /capture, /reading-notes)
    ├── inbox-classifier.md              Pre-classify inbox notes for /consolidate
    └── task-extractor.md                Extract action items from braindumps (used by /braindump)
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

## Skills vs Agents — When to Use Which

| | Skill | Agent |
|--|-------|-------|
| Invoked by | User (slash command or auto-route) | Another skill |
| Runs | Inline, sequential | Background or parallel |
| User interaction | Yes — can ask questions, confirm | No — autonomous, notifies only |
| Scope | Multi-step workflow | Single focused task |
| Reuse | One entry point | Can be dispatched by many skills |

**Create an agent when all of these are true:**
1. The task is self-contained and does not need user input mid-run
2. It would block the main agent for more than one step if done inline
3. It is either reusable across multiple skills, or benefits from parallel execution (e.g. classifying 10 inbox notes simultaneously)

**Keep it in the skill when:**
- The task is a single step that is already fast
- It needs user confirmation before acting
- It only makes sense in one skill's sequential flow

**Existing agents** (for reference before adding a new one):

| Agent | Dispatched by | Mode | Purpose |
|-------|--------------|------|---------|
| `knowledge-linker.md` | `/connect` | foreground | Find and add wikilinks across vault |
| `link-suggester.md` | `/learn` | background | Auto-add up to 3 wikilinks to a new note |
| `tag-suggester.md` | `/capture`, `/reading-notes` | background | Auto-add up to 3 tags from vault vocabulary |
| `inbox-classifier.md` | `/consolidate` | foreground parallel | Pre-classify inbox notes for routing |
| `task-extractor.md` | `/braindump` | background | Extract action items as formatted vault tasks |

## Adding a New Agent

1. Create `.claude/plugins/onebrain/agents/[agent-name].md`
2. Add YAML frontmatter:

   ```yaml
   ---
   name: Agent Display Name
   description: One-line description — what this agent does and when it runs
   color: blue
   ---
   ```

   Supported colors: `blue`, `green`, `red`, `yellow`, `purple`, `orange`.

3. Write the agent prompt with these sections:
   - **Input** — list every variable the agent receives
   - **Process** — numbered steps; keep it to ≤7 steps
   - **Constraints** — hard limits (max items, files it may not touch, exit conditions)

4. Dispatch the agent from the invoking skill using the Agent tool. Pass all required input as a structured prompt payload. Choose the dispatch mode:
   - `run_in_background: true` — for fire-and-forget tasks (link suggestion, tagging). The skill proceeds immediately; the agent notifies the user when done.
   - `run_in_background: false` — for tasks whose results the skill needs before continuing (classification, analysis). Launch multiple in parallel when processing a batch.

5. Register the agent in the **Agents** table in [INSTRUCTIONS.md](.claude/plugins/onebrain/INSTRUCTIONS.md) and in the table above. Note: both tables include a Mode column; keep them in sync.

Agents are stateless — they receive all context in the prompt payload and do not retain memory between invocations. Keep them focused on a single task.

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

**Example — checkpoint system:** OneBrain's built-in `checkpoint-hook.sh` uses the `Stop` hook to auto-save session snapshots. It fires after every response, tracks message count + elapsed time against configurable thresholds, and writes a checkpoint file when either threshold is reached. State is kept in `/tmp/onebrain-{PPID}.state` (format: `COUNT:LAST_TS:CHKPT_NN`) so the hook can accumulate counts across responses without forking a long-running process.

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

## Memory Skills

### Layer Ownership

Each memory layer has designated skills. Do not write to a layer outside your skill's scope.

| Layer | Storage | Written by |
|---|---|---|
| Session logs | `07-logs/` | `/wrapup` only |
| Memory files | `05-agent/memory/` | `/learn`, `/recap`, `/memory-review` |
| MEMORY.md — Identity | `05-agent/MEMORY.md` | `/onboarding`, manual |
| MEMORY.md — Active Projects | `05-agent/MEMORY.md` | `/learn`, manual |
| MEMORY.md — Critical Behaviors | `05-agent/MEMORY.md` | `/learn` only |

### Critical Behaviors Promotion Threshold

A behavior qualifies for MEMORY.md Critical Behaviors ONLY when ALL three are true:
1. Must apply every session without exception (not situational)
2. Forgetting causes high-impact failure (lost work, broken merge, etc.)
3. Cannot be inferred from context — must be explicitly remembered

If any condition fails → write to `memory/` with `type: behavioral` instead.

### Memory File Naming Convention

- Format: `kebab-case.md` — lowercase, hyphens, no spaces
- Length: 3–5 words (e.g. `dev-workflow-superpowers.md`)
- No date prefix — creation date tracked in `created:` frontmatter
- One concept per file

### INDEX.md Sync Rules

INDEX.md must be kept in sync at all times. Every skill that creates, updates, deprecates,
or deletes a memory/ file must also update INDEX.md:
- Create → add row; increment `total_active`
- Deprecate → remove row; decrement `total_active`
- Delete (soft) → remove row; decrement `total_active`; move file to archive
- Update → update row Description and Type columns if changed
- After any change: set INDEX.md frontmatter `updated:` to today
