# OneBrain

OneBrain — Where human and AI thinking become one. Turn Claude Code, Gemini CLI, or any AI agent into a powerful thinking partner inside your Obsidian vault — creating AI-powered synergy that captures, organizes, and synthesizes your knowledge as one unified mind.

## What It Does

- **Memory across sessions** — your AI remembers your name, role, goals, and past conversations
- **17 slash commands** — braindump, capture, bookmark, research, consolidate, connect, and more
- **Vault-native** — all notes are Markdown, everything stays in your Obsidian vault
- **Multi-agent** — works with Claude Code, Gemini CLI, or any AI that reads Markdown
- **Pre-configured** — open in Obsidian and everything is ready to go

## Prerequisites

**Required:** [git](https://git-scm.com) — used to version-control your vault.

| Platform | Install command |
|----------|----------------|
| macOS (Homebrew) | `brew install git` |
| macOS (Xcode CLT) | `xcode-select --install` |
| Windows (winget) | `winget install --id Git.Git` |
| Windows (Chocolatey) | `choco install git` |
| Debian / Ubuntu | `sudo apt install git` |
| Fedora / RHEL | `sudo dnf install git` |
| Arch | `sudo pacman -S git` |

Verify with `git --version` before running the installer.

## Quick Start

### macOS / Linux

**Option A — Install script (recommended):**

```bash
curl -fsSL https://raw.githubusercontent.com/kengio/onebrain/main/install.sh | bash
```

> The installer creates the vault in your current directory by default. You'll be prompted to confirm the location and vault name.

**Option B — Manual clone:**

```bash
git clone https://github.com/kengio/onebrain.git
cd onebrain
```

### Windows

**Option A — Install script (recommended):**

```powershell
irm https://raw.githubusercontent.com/kengio/onebrain/main/install.ps1 | iex
```

> The installer creates the vault in your current directory by default. You'll be prompted to confirm the location and vault name.

**Option B — Manual clone:**

```powershell
git clone https://github.com/kengio/onebrain.git
cd onebrain
```

### After Installation

#### 1. Open in Obsidian

- Open Obsidian → **Open folder as vault** → select the vault directory

#### 2. Community plugins

These three plugins are pre-configured in vault settings — install them via **Settings → Community plugins → Browse**, then click **Trust author and enable plugins** when prompted:

- **Tasks** — task management with due dates
- **Dataview** — query notes like a database
- **Terminal** — run your AI agent from within Obsidian

These are recommended but optional — install via the same Browse panel:

- **Templater** — advanced templates
- **Calendar** — visual calendar view
- **Tag Wrangler** — manage tags across vault
- **QuickAdd** — fast capture workflows
- **Obsidian Git** — version control for your vault

#### 3. Start your AI agent

Open the Terminal plugin in Obsidian (click the terminal icon in the sidebar), then run:

```bash
claude    # Claude Code
gemini    # Gemini CLI
```

#### 4. Run onboarding

```
/onboarding
```

This takes ~2 minutes and:
- Personalizes your vault with your name, role, and communication style
- Sets up your vault folders and personalizes your AI assistant

---

## Vault Structure

Vault folders are created during `/onboarding`.

```
onebrain/
├── 00-inbox/          Raw braindumps and captures (process regularly)
├── 01-projects/       Active projects with inline tasks
├── 02-areas/          Ongoing responsibilities (health, finances, career...)
├── 03-knowledge/      Your own synthesized thinking and insights
├── 04-resources/      External info — research output, summaries, reference
├── 05-agent/          AI-specific context and memory
│   ├── MEMORY.md      Your identity — loaded every session
│   ├── context/       Domain facts the AI reads when relevant
│   └── memory/        Behavioral patterns the AI has learned
├── 06-archive/        Completed projects and archived areas
├── 07-logs/           Session logs (YYYY-MM-DD-session-NN.md in YYYY/MM/)
├── CLAUDE.md          Instructions for Claude Code
├── GEMINI.md          Instructions for Gemini CLI
├── AGENTS.md          Universal agent instructions
├── vault.yml          Your vault configuration (created during onboarding)
└── .claude/plugins/   AI skills and hooks
```

The core workflow: capture everything to inbox → process with `/consolidate` → synthesize into knowledge or save as reference → archive what's done.

### Folder Guide

**`00-inbox/`** — Raw braindumps and captures
Process regularly. Everything unclassified lands here first.
- A thought that just crossed your mind
- A link you want to read later
- Raw output from `/braindump` or `/capture`

**`01-projects/`** — Active work with a clear goal and end date
When a project is done, archive it.
- Building a feature or product
- Planning an event or trip
- Writing a document, proposal, or article

Examples: `work/Website Redesign.md`, `personal/Japan Trip 2026.md`

**`02-areas/`** — Ongoing responsibilities that never "complete"
You maintain these indefinitely.
- Health and fitness tracking
- Personal finances and budgeting
- Career development and goals

Examples: `health/Running Log.md`, `finances/Budget 2026.md`

**`03-knowledge/`** — Your own synthesized thinking
Conclusions, frameworks, and insights you've developed — not raw reference material.
- An insight formed after reading several sources
- A mental model you use regularly
- Lessons learned from a completed project

Examples: `productivity/Deep Work Principles.md`, `technology/When to Use Microservices.md`

**`04-resources/`** — External information saved for reference
Output from `/research`, `/summarize`, `/reading-notes`, and saved reference material.
- Research output on a topic
- Summary of an article or URL
- Code snippets and how-to guides

Examples: `research/Zettelkasten Method.md`, `code-snippets/Go HTTP Middleware.md`

**`05-agent/`** — Your agent's portable mind
Everything the AI knows about you. Copy this folder to move your agent to a new vault.
- `MEMORY.md` — identity, goals, communication style (loaded every session)
- `context/` — domain facts: your stack, team, product, terminology
- `memory/` — behavioral patterns: preferences and observations from past sessions

**`06-archive/`** — Completed projects and retired areas
Organized by date archived: `06-archive/YYYY/MM/`.

**`07-logs/`** — Session logs
One file per AI session: `07-logs/YYYY/MM/YYYY-MM-DD-session-NN.md`. Generated by `/wrapup`.

## Available Commands

| Command | What it does |
|---------|-------------|
| `/onboarding` | First-run setup — run this first |
| `/braindump` | Dump everything on your mind — it gets classified and filed |
| `/capture` | Quick note with auto-linking to related notes |
| `/bookmark [url]` | Save a URL with AI-generated name, description, and category to Bookmarks.md |
| `/consolidate` | Process inbox into permanent knowledge |
| `/connect` | Find connections between notes, suggest wikilinks |
| `/research [topic]` | Web research → structured note in your vault |
| `/summarize [url]` | Fetch a URL and save a deep summary note |
| `/reading-notes` | Turn a book or article into structured notes |
| `/weekly` | Review the week, surface patterns, set intentions |
| `/tasks` | Task dashboard — overdue, due soon, open, and completed this week |
| `/wrapup` | Wrap up session and save summary to session log |
| `/learn` | Teach the agent something — facts about your world or behavioral preferences |
| `/clone` | Package your agent context for transfer to a new vault |
| `/reorganize` | Migrate flat notes into organized subfolders |
| `/update` | Update skills, config, and plugins from GitHub |
| `/help` | List all available commands with descriptions |

## Memory System

OneBrain uses a three-layer memory system:

**Layer 1 — `05-agent/MEMORY.md`** (always loaded, ~200 lines max)
Your identity: name, role, goals, communication style, recurring context. The AI reads this at the start of every session and uses it to personalize responses.

**Layer 2 — `05-agent/`** (persistent agent knowledge)
Long-lived facts and preferences that don't fit in `MEMORY.md`. Two subfolders: `context/` for domain knowledge (your stack, team, customers) and `memory/` for behavioral patterns (how you like to work). Managed by `/learn`. Clone everything with `/clone` when switching vaults.

**Layer 3 — `07-logs/`** (searchable session history)
One file per session: `YYYY-MM-DD-session-NN.md`, organized into `YYYY/MM/` subfolders. Contains summaries, decisions, insights, and action items. Generated by `/wrapup` at the end of each session.

## Task Syntax

OneBrain uses the [Obsidian Tasks](https://publish.obsidian.md/tasks/) plugin format:

```
- [ ] Task description 📅 2026-03-25
- [ ] High priority task 🔺 📅 2026-03-22
```

Tasks live inline in your notes — the Tasks plugin surfaces them across the vault.

## How the AI Knows You

After `/onboarding`, your AI agent:
- Addresses you by your preferred name
- Matches your communication style (concise vs. detailed, casual vs. formal)
- Knows your current goals and prioritizes accordingly
- Greets you at session start with inbox status and last session context
- Suggests next actions based on what's in your vault

## Supported Agents

| Agent | Instruction file | Setup |
|-------|-----------------|-------|
| Claude Code | `CLAUDE.md` | Loaded automatically |
| Gemini CLI | `GEMINI.md` | Loaded automatically |
| Any agent | `AGENTS.md` | Read manually or via system prompt |

## Customization

Edit `05-agent/MEMORY.md` directly to update your identity, goals, or recurring context at any time. The AI will pick up changes on the next session start.

## Contributing

Pull requests welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
