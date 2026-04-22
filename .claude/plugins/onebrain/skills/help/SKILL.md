---
name: help
description: "List all available OneBrain commands with descriptions and use cases. Invoke when user asks what you can do, wants to see commands, or seems confused about capabilities. Do NOT use for: actually running a command (identify the right skill and invoke it directly), answering questions about vault content (search directly), or general Claude questions."
---

# Available Commands

When this skill is invoked, present all available OneBrain commands to the user.

## Step 0: Show Plugin Version and Install Location

1. Determine install location: use Glob to check if `.claude/plugins/onebrain/.claude-plugin/plugin.json` exists relative to the vault root
   - If it exists → this is a **project plugin**
   - If it does not exist → this is a **global plugin** (installed at `~/.claude/plugins/`)
2. Read the version from the correct path:
   - If project plugin: read from `.claude/plugins/onebrain/.claude-plugin/plugin.json`
   - If global plugin: use Glob on `~/.claude/plugins/cache/onebrain/onebrain/*/.claude-plugin/plugin.json` to find all cached versions. If multiple matches are returned, use the one with the highest version number (compare the version directory name as semver). If no matches are found, skip the version display.
3. Display as the first line of your response:
   - If project plugin: OneBrain v{version} (project plugin)
   - If global plugin: OneBrain v{version} (global plugin)
   - If version could not be determined: OneBrain

## Step 1: Present the Command List

Display a grouped plain text output:

```
──────────────────────────────────────────────────────────────
📖 OneBrain Commands — v{version}
──────────────────────────────────────────────────────────────
Capture & Organize
  /capture        Quick note capture with wikilinks
  /braindump      Dump raw thoughts, ideas, tasks
  /bookmark       Save a URL to Bookmarks.md
  /consolidate    Process inbox into knowledge base

Research & Recall
  /research       Web research → structured knowledge note
  /summarize      URL → deep summary note
  /reading-notes  Book or article → structured notes
  /connect        Find connections between notes

Review & Reflect
  /daily          Daily briefing — tasks + last session
  /weekly         Weekly reflection and planning
  /recap          Promote session insights to memory
  /distill        Compress a research thread into knowledge

System
  /tasks          Open live task dashboard
  /moc            Refresh vault portal (MOC.md)
  /doctor         Vault health check
  /update         Update OneBrain to latest version
  /learn          Teach the agent something to remember
  /wrapup         Save session summary to log
  /memory-review  Interactive memory pruning
  /clone          Package agent context for vault transfer
  /reorganize     Migrate flat notes into subfolders
  /qmd            Manage search index
  /onboarding     First-run vault setup
  /help           Show this list
──────────────────────────────────────────────────────────────
/help [command] for details on any command
```

## Step 2: Add a Usage Note

After the command list, add:

Tips:
  • Commands use the `/` prefix — for example, `/braindump`, `/tasks`, `/research`
  • You can also describe what you want in plain language
  • New to OneBrain? Start with `/onboarding`
