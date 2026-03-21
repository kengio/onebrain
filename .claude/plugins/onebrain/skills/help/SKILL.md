---
name: help
description: List all available OneBrain commands with descriptions and use cases. Invoke when user asks what you can do, wants to see commands, or seems confused about capabilities.
---

# /help — Available Commands

When this skill is invoked, present all available OneBrain commands to the user.

## Step 1: Present the Command Table

Display a formatted table with all available commands:

| Command | What it does | When to use it |
|---------|-------------|----------------|
| `/onboarding` | First-run setup — personalizes your agent, vault structure, and preferences | Use once when setting up a new vault |
| `/braindump` | Capture a stream of raw thoughts, ideas, and tasks | When your head is full and you need to offload everything |
| `/capture` | Quick note capture with automatic wikilink suggestions | When you want to save a single idea, reference, or thought |
| `/consolidate` | Review and merge inbox items into your knowledge base | When your inbox is getting full and needs processing |
| `/connect` | Find connections between notes and suggest wikilinks | When you want to strengthen the web of ideas in your vault |
| `/research` | Web research on a topic → structured knowledge note | When you want to learn about something and save it |
| `/summarize-url` | Fetch a URL and create a structured summary note | When you want to save and summarize an article or page |
| `/reading-notes` | Book or article → structured progressive summary | When finishing a book or long article and want to capture it |
| `/tasks` | Task dashboard — overdue, due soon, open, completed | When you want an overview of what needs doing |
| `/weekly` | Weekly reflection — review sessions, patterns, intentions | At the end of each week for review and planning |
| `/wrapup` | Save a session summary to your memory log | At the end of a work session to capture what you did |
| `/update` | Update OneBrain system files from GitHub | When a new version is available |
| `/help` | List all available commands | You're already here! |

## Step 2: Add a Usage Note

After the table, add:

---

**Tips:**
- Commands use the `/` prefix — for example, `/braindump`, `/tasks`, `/research`
- You can also describe what you want in plain language: "I want to dump some thoughts" or "show me my tasks"
- New to OneBrain? Start with `/onboarding` to set up your vault and personalize your AI assistant
