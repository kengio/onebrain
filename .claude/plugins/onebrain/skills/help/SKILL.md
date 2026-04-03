---
name: help
description: List all available OneBrain commands with descriptions and use cases. Invoke when user asks what you can do, wants to see commands, or seems confused about capabilities.
---

# /help — Available Commands

When this skill is invoked, present all available OneBrain commands to the user.

## Step 0: Show Plugin Version and Install Location

1. Determine install location: use Glob to check if `.claude/plugins/onebrain/.claude-plugin/plugin.json` exists relative to the vault root
   - If it exists → this is a **project plugin**
   - If it does not exist → this is a **global plugin** (installed at `~/.claude/plugins/`)
2. Read the version from the correct path:
   - If project plugin: read from `.claude/plugins/onebrain/.claude-plugin/plugin.json`
   - If global plugin: use Glob on `~/.claude/plugins/cache/onebrain/onebrain/*/.claude-plugin/plugin.json` to find all cached versions. If multiple matches are returned, use the one with the highest version number (compare the version directory name as semver). If no matches are found, skip the version display.
3. Display as the first line of your response:
   - If project plugin: **OneBrain v{version}** (project plugin)
   - If global plugin: **OneBrain v{version}** (global plugin)
   - If version could not be determined: **OneBrain**

## Step 1: Present the Command Table

Display a formatted table with all available commands:

| Command | What it does | When to use it |
|---------|-------------|----------------|
| `/onboarding` | First-run setup — personalizes your agent, vault structure, and preferences | Use once when setting up a new vault |
| `/braindump` | Capture a stream of raw thoughts, ideas, and tasks | When your head is full and you need to offload everything |
| `/capture` | Quick note capture with automatic wikilink suggestions | When you want to save a single idea, reference, or thought |
| `/bookmark` | Save a URL with AI-generated name, description, and category to Bookmarks.md | When you want to quickly park a link for later without full processing |
| `/consolidate` | Review and merge inbox items into your knowledge base | When your inbox is getting full and needs processing |
| `/connect` | Find connections between notes and suggest wikilinks | When you want to strengthen the web of ideas in your vault |
| `/research` | Web research on a topic → structured knowledge note | When you want to learn about something and save it |
| `/summarize` | Fetch a URL and create a structured summary note | When you want to deeply process an article or page into a permanent vault note |
| `/import` | Import local files (PDF, Word, Excel, images, video, scripts) into vault notes | When you have files on disk you want distilled into your knowledge base |
| `/reading-notes` | Book or article → structured progressive summary | When finishing a book or long article and want to capture it |
| `/tasks` | Open live task dashboard in Obsidian — creates/updates `TASKS.md` with live query sections | When you want an overview of what needs doing |
| `/moc` | Create or refresh vault portal (MOC.md) — a Map of Content with live queries, AI summary, and your pinned links | When you want a bird's-eye view of your entire vault |
| `/weekly` | Weekly reflection — review sessions, patterns, intentions | At the end of each week for review and planning |
| `/recap` | Cross-session synthesis — reads 7 days of logs, surfaces patterns, updates MEMORY.md Key Learnings | Periodically, when you want to distill recent sessions into long-term memory |
| `/wrapup` | Save a session summary to your session log | At the end of a work session to capture what you did |
| `/learn` | Teach the agent something — facts about your world or behavioral preferences | When you want the agent to remember something across all future sessions |
| `/clone` | Package your agent context (agent folder including MEMORY.md) for vault transfer | When moving to a new vault and want to preserve your agent's memory |
| `/reorganize` | Migrate existing flat notes into subfolders — one-time migration | After upgrading to a version with subfolder organization |
| `/qmd` | Set up and manage qmd search index (setup, embed, status, reindex, uninstall) | When you want faster vault search or need to manage the search index |
| `/update` | Update OneBrain system files from GitHub | When a new version is available |
| `/help` | List all available commands | You're already here! |

## Step 2: Add a Usage Note

After the table, add:

---

**Tips:**
- Commands use the `/` prefix — for example, `/braindump`, `/tasks`, `/research`
- You can also describe what you want in plain language: "I want to dump some thoughts" or "show me my tasks"
- New to OneBrain? Start with `/onboarding` to set up your vault and personalize your AI assistant
