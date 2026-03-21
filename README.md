# OneBrain

An AI-powered second brain for Obsidian. Turn Claude Code, Gemini CLI, or any AI agent into a personal chief of staff that lives inside your vault — one that knows you, remembers past sessions, and helps you capture, organize, and synthesize knowledge.

## What It Does

- **Memory across sessions** — your AI remembers your name, role, goals, and past conversations
- **12 slash commands** — braindump, capture, research, consolidate, connect, and more
- **Vault-native** — all notes are Markdown, everything stays in your Obsidian vault
- **Multi-agent** — works with Claude Code, Gemini CLI, or any AI that reads Markdown
- **Pre-configured** — open in Obsidian and everything is ready to go

## Quick Start

### macOS / Linux

**Option A — Install script (recommended):**

```bash
curl -fsSL https://raw.githubusercontent.com/kengio/onebrain/main/install.sh | bash
```

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

**Option B — Manual clone:**

```powershell
git clone https://github.com/kengio/onebrain.git
cd onebrain
```

### After Installation

#### 1. Open in Obsidian

- Open Obsidian → **Open folder as vault** → select the vault directory
- When prompted about community plugins, click **Trust author and enable plugins**

#### 2. Install community plugins

Go to **Settings → Community plugins → Browse** and install:

- **Tasks** — task management with due dates
- **Dataview** — query notes like a database
- **Templater** — advanced templates
- **Calendar** — visual calendar view
- **Tag Wrangler** — manage tags across vault
- **QuickAdd** — fast capture workflows
- **Obsidian Git** — version control for your vault
- **Terminal** — run your AI agent from within Obsidian

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
- Lets you choose a vault organization method (OneBrain, PARA, or Zettelkasten)
- Creates your vault folders and updates all system files to match

---

## Vault Structure

Vault folders are created during `/onboarding`. You'll choose one of three organization methods — each creates a different folder layout and updates all system files to match.

---

### Method 1: OneBrain (default)

A simple, opinionated structure built for this system. Best for general-purpose note-taking and getting things done without overthinking organization.

```
onebrain/
├── 00-inbox/          Raw braindumps and captures (process regularly)
├── 01-projects/       Active projects with inline tasks
├── 02-knowledge/      Consolidated notes and insights
├── 03-archive/        Completed and old items
└── 04-memory-log/     Session summaries (one per session)
```

The core workflow: capture everything to inbox → process with `/consolidate` → grow your knowledge base → archive what's done.

---

### Method 2: PARA

Developed by Tiago Forte in [*Building a Second Brain*](https://www.buildingasecondbrain.com/). Organizes information by **actionability** rather than topic — making it easier to answer "what do I actually need right now?"

The four categories:
- **Projects** — efforts with a deadline and desired outcome (finite)
- **Areas** — ongoing responsibilities with no end date (health, finances, career)
- **Resources** — topics you're interested in for future reference
- **Archive** — inactive items from any of the above

```
onebrain/
├── 00-inbox/          Capture — quick notes before processing
├── 01-projects/       Short-term efforts with deadlines
├── 02-areas/          Ongoing responsibilities (health, finance, career)
├── 03-resources/      Topics of interest, reference material
├── 04-archive/        Inactive items from any category
└── 05-memory-log/     Session summaries (one per session)
```

Skills that save reference notes (like `/research`, `/consolidate`, and `/capture`) route to `03-resources/`. The `02-areas/` folder is for manually organizing ongoing responsibilities — there is no automated skill routing to it.

Note: `00-inbox/` and `05-memory-log/` are OneBrain additions on top of the PARA taxonomy — they are not native PARA categories.

Best for: action-oriented people, those managing many parallel responsibilities, anyone who has read *Building a Second Brain*.

---

### Method 3: Zettelkasten

Developed by sociologist Niklas Luhmann, who used a physical slip-box to write over 70 books. Popularized for digital use by Sönke Ahrens in [*How to Take Smart Notes*](https://www.soenkeahrens.de/en/takesmartnotes). Focuses on building a **network of atomic, linked ideas** rather than a filing system.

The three note types:
- **Fleeting notes** — raw capture, processed and discarded or promoted
- **Literature notes** — what you took from a source, in your own words
- **Permanent notes** — atomic, standalone ideas linked to other permanent notes

```
onebrain/
├── 00-fleeting/       Temporary capture — raw ideas, quick notes
├── 01-literature/     Notes from sources you've read
├── 02-permanent/      Atomic, linked notes — your knowledge graph
├── 03-archive/        Inactive and completed items
└── 04-memory-log/     Session summaries (one per session)
```

Best for: researchers, writers, academics, and anyone who wants to build a knowledge graph where ideas connect and compound over time. Pairs well with Obsidian's graph view and wikilinks.

---

In all cases, the vault root also contains:
```
├── MEMORY.md          Your identity — loaded every session
├── CLAUDE.md          Instructions for Claude Code
├── GEMINI.md          Instructions for Gemini CLI
├── AGENTS.md          Universal agent instructions
└── vault.yml          Your vault method configuration (created during onboarding)
```

## Available Commands

| Command | What it does |
|---------|-------------|
| `/onboarding` | First-run setup — run this first |
| `/braindump` | Dump everything on your mind — it gets classified and filed |
| `/capture` | Quick note with auto-linking to related notes |
| `/consolidate` | Process inbox into permanent knowledge |
| `/connect` | Find connections between notes, suggest wikilinks |
| `/research [topic]` | Web research → structured note in your vault |
| `/summarize-url [url]` | Fetch a URL and save a summary note |
| `/reading-notes` | Turn a book or article into structured notes |
| `/weekly` | Review the week, surface patterns, set intentions |
| `/tasks` | Task dashboard — overdue, due soon, open, and completed this week |
| `/tldr` | Save a session summary to your memory log |
| `/update` | Update skills, config, and plugins from GitHub |

## Memory System

OneBrain uses a two-layer memory system:

**Layer 1 — `MEMORY.md`** (always loaded, ~200 lines max)
Your identity: name, role, goals, communication style, recurring context. The AI reads this at the start of every session and uses it to personalize responses.

**Layer 2 — memory log folder** (searchable history)
One file per session: `YYYY-MM-DD-session-NN.md`. Contains summaries, decisions, insights, and action items. Generated by `/tldr` at the end of each session. Default folder name is `04-memory-log/`; may differ based on your vault method (see `vault.yml`).

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

Edit `MEMORY.md` directly to update your identity, goals, or recurring context at any time. The AI will pick up changes on the next session start.

## Contributing

Pull requests welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT
