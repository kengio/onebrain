---
name: help
description: "List all available OneBrain commands with descriptions and use cases. Invoke when user asks what you can do, wants to see commands, or seems confused about capabilities. Do NOT use for: actually running a command (identify the right skill and invoke it directly), answering questions about vault content (search directly), or general Claude questions."
schedulable: false
---

# Available Commands

Skills are organized by workflow phase — Input → Process → Recall → Maintain.

## 📥 INPUT — Capture & ingest

| Command | Purpose |
|---------|---------|
| `/onboarding` | First-run setup (capture identity + preferences) · *first run only* |
| `/capture` | Quick titled note with auto-links |
| `/braindump` | Stream-of-consciousness multi-thread dump |
| `/bookmark` | Save URL with AI-generated metadata |
| `/summarize` | Fetch URL → deep summary note |
| `/import` | Local file (PDF/docs/images) → vault note |
| `/reading-notes` | Book/article → structured notes |
| `/research` | Web research → resources/ note |

## ⚙️ PROCESS — Synthesize & organize

| Command | Purpose |
|---------|---------|
| `/consolidate` | Inbox → knowledge base |
| `/distill` | Multi-session notes → digest |
| `/connect` | Find note-to-note links |
| `/recap` | Session insights → memory/ |
| `/weekly` | Weekly reflection |
| `/daily` | Daily briefing |
| `/learn` | Teach agent a fact / preference |

## 🔍 RECALL — Retrieve & navigate

| Command | Purpose |
|---------|---------|
| `/search` | General vault retrieval — answers what + why questions |
| `/tasks` | Live task dashboard |
| `/moc` | Vault portal map |
| `/memory-review` | Audit memory/ files |

## 🔧 MAINTAIN — System housekeeping

| Command | Purpose |
|---------|---------|
| `/update` | Pull latest from GitHub |
| `/doctor` | Vault + plugin health check |
| `/reorganize` | Migrate vault structure |
| `/clone` | Package agent context for transfer |
| `/qmd` | qmd search index management |
| `/help` | This catalog |
| `/wrapup` | Session log |
