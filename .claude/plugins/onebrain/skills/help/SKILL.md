---
name: help
description: List all available OneBrain commands with descriptions and use cases. Invoke when user asks what you can do, wants to see commands, or seems confused about capabilities.
triggers:
  - /ob:help
  - ob:help
  - ob:commands
  - what can you do
  - what commands are available
---

# /ob:help — Available Commands

When this skill is invoked, present all available OneBrain commands to the user.

## Step 1: Read Available Skills

Read `.claude/plugins/onebrain/plugin.json` to get the list of registered skills.

For each skill path in the `"skills"` array, read the corresponding `SKILL.md` file at:
`.claude/plugins/onebrain/{skill-path}/SKILL.md`

Extract from each file's frontmatter: `name`, `description`, and the first trigger (primary command).

## Step 2: Present the Command Table

Display a formatted table with all available commands:

| Command | What it does | When to use it |
|---------|-------------|----------------|
| `/ob:onboarding` | First-run setup — personalizes your agent, vault structure, and preferences | Use once when setting up a new vault |
| `/ob:braindump` | Capture a stream of raw thoughts, ideas, and tasks | When your head is full and you need to offload everything |
| `/ob:capture` | Quick note capture with automatic wikilink suggestions | When you want to save a single idea, reference, or thought |
| `/ob:consolidate` | Review and merge inbox items into your knowledge base | When your inbox is getting full and needs processing |
| `/ob:connect` | Find connections between notes and suggest wikilinks | When you want to strengthen the web of ideas in your vault |
| `/ob:research` | Web research on a topic → structured knowledge note | When you want to learn about something and save it |
| `/ob:summarize-url` | Fetch a URL and create a structured summary note | When you want to save and summarize an article or page |
| `/ob:reading-notes` | Book or article → structured progressive summary | When finishing a book or long article and want to capture it |
| `/ob:tasks` | Task dashboard — overdue, due soon, open, completed | When you want an overview of what needs doing |
| `/ob:weekly` | Weekly reflection — review sessions, patterns, intentions | At the end of each week for review and planning |
| `/ob:wrapup` | Save a session summary to your memory log | At the end of a work session to capture what you did |
| `/ob:update` | Update OneBrain system files from GitHub | When a new version is available |
| `/ob:help` | List all available commands | You're already here! |

## Step 3: Add a Usage Note

After the table, add:

---

**Tips:**
- Commands work with or without the `/` prefix — both `/ob:braindump` and `ob:braindump` work
- You can also describe what you want in plain language: "I want to dump some thoughts" or "show me my tasks"
- New to OneBrain? Start with `/ob:onboarding` to set up your vault and personalize your AI assistant
