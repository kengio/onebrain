# Contributing to OneBrain

Thanks for your interest in contributing. This document covers how the project is structured and how to submit changes.

## What to Contribute

Good contributions include:

- New slash commands (skills)
- New background agents (focused autonomous tasks dispatched by skills)
- Improvements to existing skills — clearer instructions, better prompts, edge case handling
- Fixes to the `onebrain` CLI binary (TypeScript / Bun source under `src/`)
- New harness adapters (instruction file + tool-name reference for an additional AI harness)
- README and documentation improvements

## Project Structure

```text
.claude/plugins/onebrain/                Main plugin directory
├── .claude-plugin/
│   └── plugin.json                      Plugin manifest (name, version, description)
├── INSTRUCTIONS.md                      Shared agent instructions — harness-neutral core
├── references/                          Harness-specific context loaded by GEMINI.md / AGENTS.md
│   ├── gemini-tools.md                  Tool name mapping for Gemini CLI
│   └── codex-tools.md                   Tool name mapping for Codex CLI
├── startup/                             Startup utilities loaded at session begin
│   └── scripts/                         Predefined shell scripts called by INSTRUCTIONS.md
│       └── open-in-obsidian.sh          Opens a vault file in the Obsidian app
├── skills/                              One directory per slash command (25 skills)
│   └── [name]/
│       ├── SKILL.md                     The skill prompt — what the AI follows when invoked
│       ├── references/                  Large content loaded on-demand (handlers, templates, procedures)
│       └── scripts/                     Predefined shell scripts called inline by the skill
└── agents/
    ├── knowledge-linker.md              Knowledge graph agent (used by /connect)
    ├── link-suggester.md                Auto-add wikilinks after note creation (used by /learn)
    ├── tag-suggester.md                 Auto-add tags from vault vocabulary (used by /capture, /reading-notes)
    ├── inbox-classifier.md              Pre-classify inbox notes for /consolidate
    └── task-extractor.md                Extract action items from braindumps (used by /braindump)
```

Key files: [plugin.json](.claude/plugins/onebrain/.claude-plugin/plugin.json) · [INSTRUCTIONS.md](.claude/plugins/onebrain/INSTRUCTIONS.md)

Skills are plain Markdown files. The AI reads them at runtime — no compilation or build step.

**Predefined scripts** (`startup/scripts/` and `skills/[name]/scripts/`) are shell scripts the AI calls via `bash "path/to/script.sh"` instead of writing bash inline. Use them for repeatable operations (datetime, session token detection, qmd update, file opens, hook state reset) so Claude does not spend tokens re-generating the same bash logic each time. All scripts must be defensive — exit silently when conditions are not met (binary missing, variable unset, etc.).

## Multi-Harness Support

OneBrain is harness-agnostic — it ships entrypoint files for the major AI harnesses, plus a generic `AGENTS.md` for everything else. Each entrypoint loads harness-specific context before delegating to the shared `INSTRUCTIONS.md`:

| File | Harness | Loads |
|---|---|---|
| `CLAUDE.md` | Claude Code *(reference harness)* | `INSTRUCTIONS.md` directly |
| `GEMINI.md` | Gemini CLI | `references/gemini-tools.md` → `INSTRUCTIONS.md` |
| `AGENTS.md` | OpenAI Codex · Qwen Code · any AGENTS-spec harness | `references/codex-tools.md` → `INSTRUCTIONS.md` |

Users can also drive any of the above with a different LLM behind it (local via litellm/ollama proxy, or any cloud BYOK). See [README → The Harness OS Architecture](README.md#the-harness-os-architecture) for the user-facing flow.

**INSTRUCTIONS.md is harness-neutral** — it uses Claude Code tool names throughout. The `references/` files translate those names to each harness's equivalents.

When editing INSTRUCTIONS.md or skills, use Claude Code tool names (`Read`, `Write`, `Edit`, `Bash`, `Agent`, etc.) — the harness mapping handles translation automatically.

**Adding a new harness:** create a root entrypoint file (e.g. `MYHARNESS.md`) that points to `INSTRUCTIONS.md`, plus an optional `references/myharness-tools.md` for tool-name remapping. Update the table above and the install matrix in `README.md`.

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

5. Register the agent in the **Agents** table in [INSTRUCTIONS.md](.claude/plugins/onebrain/INSTRUCTIONS.md) and add the filename to the `agents/` tree in the **Project Structure** section above. The Agents table has four columns — fill all of them: **Agent File**, **Dispatched by**, **Mode**, and **Purpose**.

Agents are stateless — they receive all context in the prompt payload and do not retain memory between invocations. Keep them focused on a single task.

## Adding a New Hook

Hooks run shell commands automatically when Claude performs certain actions. Hook configuration lives in the **vault's** `.claude/settings.json`. Shell scripts (for PostToolUse hooks) go in `.claude/plugins/onebrain/hooks/`.

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
| `Notification` | When Claude Code sends a notification | No |
| `ConfigChange` | When a configuration file changes during a session | Yes |
| `WorktreeCreate` | When a worktree is being created | Yes |
| `WorktreeRemove` | When a worktree is being removed | No |
| `TeammateIdle` | When an agent team teammate is about to go idle | Yes |
| `TaskCompleted` | When a task is being marked as completed | Yes |
| `Elicitation` | When an MCP server requests user input during a tool call | Yes |
| `ElicitationResult` | After user responds to MCP elicitation | Yes |

Most hooks support a `matcher` field to filter by tool name or event subtype. `UserPromptSubmit`, `Stop`, `TeammateIdle`, `TaskCompleted`, `WorktreeCreate`, and `WorktreeRemove` fire on every occurrence and do not support matchers.

**Example — checkpoint system:** OneBrain's checkpoint system uses the `Stop` hook to auto-save session snapshots. The hook calls `onebrain checkpoint stop` (the CLI binary). The binary tracks message count + elapsed time against configurable thresholds and emits a `decision:block` JSON payload when a checkpoint is due. State is kept in `$TMPDIR/onebrain-{session_token}.state` (format: `count:last_ts:last_stop_nn`) so counts accumulate across responses, including across compact events.

**To add a hook:**

1. Add the hook entry to the **vault's** `.claude/settings.json` under the appropriate event key. Hook commands use relative paths — Claude Code runs hooks from the vault directory as CWD.

2. For PostToolUse hooks that call a shell script, create the script in `.claude/plugins/onebrain/hooks/`. Write a single `.sh` script — it runs on macOS, Linux, and Windows (via Git Bash, which ships with Git for Windows). No `.ps1` variant is needed.

3. Make scripts defensive — they run on every matching event, so they should exit silently if there's nothing to do.

4. **Stop hooks must NOT use `"async": true`** — they inject prompts via `decision:block` written to stdout, which requires synchronous completion before Claude's next response. Async execution fires too late for prompt injection.

5. Use `/update` (or `onebrain register-hooks`) to register or repair the `Stop` hook (and the optional `PostToolUse` qmd-reindex hook when `qmd_collection` is set in `vault.yml`) automatically.

## Memory System

### Layer Ownership

Each memory layer has designated skills. Do not write to a layer outside your skill's scope.

> Paths below use variable form — defaults are `05-agent/` for `[agent_folder]` and `07-logs/` for `[logs_folder]`. See the Configuration table in INSTRUCTIONS.md.

| Layer | Storage | Written by |
|---|---|---|
| Session logs | `[logs_folder]/` | `/wrapup` only |
| Memory files | `[agent_folder]/memory/` | `/learn`, `/recap`, `/memory-review` |
| MEMORY.md — Identity | `[agent_folder]/MEMORY.md` | `/onboarding`, manual |
| MEMORY.md — Active Projects | `[agent_folder]/MEMORY.md` | `/learn`, manual |
| MEMORY.md — Critical Behaviors | `[agent_folder]/MEMORY.md` | `/learn` only |

### Critical Behaviors Promotion Threshold

A behavior qualifies for MEMORY.md Critical Behaviors ONLY when ALL three are true:
1. Must apply every session without exception (not situational)
2. Forgetting causes high-impact failure (lost work, broken merge, etc.)
3. Cannot be inferred from context — must be explicitly remembered

If any condition fails → write to `memory/` with `type: behavioral` instead.

### Memory File Naming

- Format: `kebab-case.md` — lowercase, hyphens, no spaces
- Length: 3–5 words (e.g. `dev-workflow-superpowers.md`)
- No date prefix — creation date tracked in `created:` frontmatter
- One concept per file

### Recall Order

Skills that surface past information must search memory layers in this priority order — stop as soon as a confident answer is found:

1. `[agent_folder]/MEMORY.md` — always in context; check here first
2. `[agent_folder]/memory/` — match query keywords against MEMORY-INDEX.md Topics column to find relevant files, then read them; fall back to direct grep if no topic match
3. `[logs_folder]/` — grep session logs for past decisions and discussions

### MEMORY-INDEX.md Sync Rules

MEMORY-INDEX.md must be kept in sync at all times. Every skill that creates, updates, deprecates, or deletes a memory/ file must also update MEMORY-INDEX.md:

- Create → add row; increment `total_active`
- Deprecate → remove row; decrement `total_active`
- Delete (soft) → remove row; decrement `total_active`; move file to archive
- Update → update row Description and Type columns if changed
- After any change: set MEMORY-INDEX.md frontmatter `updated:` to today

## Vault Bootstrap

Vault setup is owned by the `onebrain` CLI binary (`src/`), **not** by shell scripts in this repo. The user flow is:

1. `npm install -g @onebrain-ai/cli` — installs the CLI globally
2. `onebrain init` — in a new or existing folder, writes `vault.yml`, scaffolds the 8 standard folders, downloads the latest plugin bundle, installs the recommended Obsidian community plugins, and registers the `Stop` hook (plus a `PostToolUse` qmd-reindex hook when `qmd_collection` is set). Aborts safely if a `vault.yml` already exists
3. `/onboarding` — inside the chosen harness, personalises identity + active projects

There are no `install.sh` or `install.ps1` scripts to maintain — the equivalent logic lives in the CLI's `init` and `update` commands and ships with each release. Bug fixes for vault bootstrap belong in `src/commands/init.ts` and `src/commands/update.ts`.

## Pull Request Guidelines

- One logical change per PR
- Include a brief description of what changed and why
- If adding a skill, show an example interaction in the PR description
- Keep skill files readable — they're prompts, not code
- **Never commit directly to `main`** — all changes go through a PR with a worktree branch
- Update PR title and description after every new commit pushed to an open PR

## Versioning

Two independent version tracks — bump only the track that changed:

| Track | Files | Bump when |
|---|---|---|
| **Plugin** | `plugin.json` · `PLUGIN-CHANGELOG.md` | ANY vault-deployed content changes — `.claude/plugins/onebrain/` (Claude plugin), `.gemini/` (Gemini config), or any future harness config. "Plugin" here means OneBrain content shipped to the vault, regardless of which harness reads it. |
| **CLI** | `package.json` · `CHANGELOG.md` | TypeScript source changes (`src/`) only — the `@onebrain-ai/cli` binary. |

**Bump rules**

- **Plugin:** patch for fixes/docs, minor for new content (skills, commands, hooks, harness configs), major for breaking schema changes.
- **CLI:** patch for bug fixes, minor for new commands, major for breaking changes.

After merging a CLI change → push tag `v{cli-version}` to trigger release workflow (builds binaries + publishes npm).
The Plugin track has its own changelog (`PLUGIN-CHANGELOG.md`) but no separate git tag — `plugin.json` is the source of truth and `vault-sync` reads it on every `/update` to detect drift.

## Reporting Issues

Open a GitHub issue with:

- What you expected to happen
- What actually happened
- Which AI agent you were using (Claude Code, Gemini CLI, etc.)
- Relevant skill output if applicable
