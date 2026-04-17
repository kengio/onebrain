<p align="center">
  <img src="assets/banner.png" alt="OneBrain — Your personal AI OS" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/kengio/onebrain/releases"><img src="https://img.shields.io/badge/dynamic/json?url=https://raw.githubusercontent.com/kengio/onebrain/main/.claude/plugins/onebrain/.claude-plugin/plugin.json&query=%24.version&label=version&style=flat-square&color=blue" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/kengio/onebrain?style=flat-square" alt="License" /></a>
  <a href="https://github.com/kengio/onebrain/stargazers"><img src="https://img.shields.io/github/stars/kengio/onebrain?style=flat-square" alt="GitHub Stars" /></a>
  <a href="https://github.com/kengio/onebrain/commits/main"><img src="https://img.shields.io/github/last-commit/kengio/onebrain?style=flat-square" alt="Last Commit" /></a>
</p>

<h1 align="center">OneBrain</h1>

<p align="center">
  <em>Your AI forgets everything when the session ends.<br>
  Your notes, your AI, and your tools live in separate silos.<br>
  OneBrain fixes both — giving you a thinking partner that remembers everything.</em>
</p>

<p align="center">
  <strong>Your personal AI OS</strong> — persistent memory, 24+ skills, and a full local stack<br>
  (Claude Code + Obsidian + tmux + Telegram), entirely on your own machine.
</p>

<p align="center">
  <a href="#get-started">Get Started →</a> &nbsp;·&nbsp; <a href="#commands">View Commands →</a>
</p>

---

## What is OneBrain?

OneBrain is an AI operating system layer built on top of Obsidian. It gives your AI agent persistent memory, a structured knowledge vault, and 24+ pre-built skills — so every session picks up exactly where the last one left off.

Unlike chat-based AI tools, OneBrain lives in plain Markdown files you own forever. No cloud sync required. No proprietary format. Just your agent, your vault, your data.

**Works with:** Claude Code · Gemini CLI · any agent that reads Markdown

---

## Features

| | Feature | Description |
|---|---|---|
| 🧠 | **Persistent Memory** | Remembers your name, goals, preferences, and decisions across every session |
| 🖥️ | **Personal AI OS** | Full local stack: Claude Code + Obsidian + tmux + Telegram — no cloud infra needed |
| ⚡ | **24+ Skills** | Braindump, research, consolidate, bookmark, import files, daily briefing, and more |
| 📂 | **Vault-native Markdown** | Plain Markdown, no lock-in. Your data stays yours forever |
| 🤖 | **Multi-agent** | Works with Claude Code, Gemini CLI, or any agent that reads Markdown |
| 🔌 | **Zero Config** | Clone, open in Obsidian, run `/onboarding`. Ready in under 2 minutes |
| 📓 | **Session Logs & Checkpoints** | Every conversation saved with summaries and action items. Auto-checkpoints fire every 15 messages or 30 min so nothing is lost mid-session *(auto-checkpoint requires Claude Code)* |
| 🔗 | **Knowledge Synthesis** | `/consolidate` turns inbox captures into permanent connected knowledge |
| 🔬 | **Confidence-scored Memory** | Every insight carries `[conf:high/medium/low]` + `[verified:YYYY-MM-DD]` — knowledge that grows more reliable with use |
| 💎 | **Knowledge Distillation** | `/distill` crystallizes a completed research thread into a permanent structured note in your knowledge base |
| 🩺 | **Vault Doctor** | `/doctor` audits broken links, orphan notes, stale memory, and inbox backlog; `--fix` auto-repairs confidence scores and wikilinks |
| 🎓 | **Teachable AI** | `/learn` permanently shapes how your agent thinks and responds |
| 📱 | **Mobile Access** | Send instructions and receive briefings from anywhere via Telegram |

---

## Use Cases

### 🖥️ Personal AI OS

Run OneBrain as your personal AI operating system — a complete AI environment that runs locally with no cloud infrastructure required.

**Recommended stack:**

| Tool | Role |
|------|------|
| [Claude Code](https://claude.ai/code) | Your AI agent, running in the terminal |
| [Obsidian](https://obsidian.md) | Your vault — single source of truth for memory and knowledge |
| [tmux](https://github.com/tmux/tmux) | Persistent sessions that survive disconnects and reboots |
| [Telegram](https://telegram.org) | Mobile access: send instructions, receive briefings from anywhere |

**Setting up the full stack:**

1. Install OneBrain and open your vault in Obsidian ([Get Started](#get-started))
2. Start a tmux session: `tmux new -s onebrain`
3. Start Claude Code in your vault directory: `claude`
4. Run `/telegram:configure` to connect Claude Code's built-in Telegram channel — no custom bot or external infra needed
5. From any device, open Telegram and send instructions directly to your OneBrain agent

Your agent, your vault, your data — forever.

### 🧠 Thinking Partner

Use OneBrain as a daily thinking partner. Capture ideas with `/braindump`, research topics with `/research`, synthesize knowledge with `/consolidate`, and surface connections you'd never find manually with `/connect`.

### 📚 Knowledge Base Builder

Turn your AI into a knowledge curator: research, summarize, import files, and build a connected Markdown knowledge base that grows smarter over time.

---

## How It Works

After `/onboarding`, your AI agent:

1. **Loads your identity** — name, role, goals, communication style, active projects
2. **Greets you with context** — inbox status, overdue tasks, patterns from recent sessions
3. **Remembers everything** — decisions, preferences, and insights accumulate over time
4. **Suggests next actions** — based on what's in your vault, not what it can infer from scratch

### Memory System

OneBrain uses a four-tier memory system — each tier is more compressed and longer-lived than the one below:

| Tier | Location | What it stores | Promoted by |
|------|----------|---------------|-------------|
| **Working** | `00-inbox/` + current session | Raw captures, active conversation | `/consolidate`, `/wrapup` |
| **Episodic** | `07-logs/YYYY/MM/` | Session summaries, decisions, action items | `/wrapup`, auto-checkpoint |
| **Semantic** | `05-agent/MEMORY.md` | Identity + Active Projects + Critical Behaviors — no hard limit, ~55 lines target | `/learn` (Critical Behaviors only) |
| **Knowledge** | `03-knowledge/`, `05-agent/memory/` | Permanent notes, behavioral patterns, domain facts | `/distill`, `/learn`, `/recap` |

---

## Memory Promotion

OneBrain organizes agent memory across three layers. Each layer has specific skills responsible for writing to it.

| Layer | Storage | Written by |
|---|---|---|
| Session log | `07-logs/` | `/wrapup` (end of session) |
| Memory files | `05-agent/memory/` | `/learn` (user-driven, single fact), `/recap` (batch synthesis), `/memory-review` (edits) |
| Always-loaded — Identity | `05-agent/MEMORY.md` | `/onboarding` (one-time), manual edits |
| Always-loaded — Active Projects | `05-agent/MEMORY.md` | `/learn` (project lifecycle events), manual edits |
| Always-loaded — Critical Behaviors | `05-agent/MEMORY.md` | `/learn` only (user explicitly teaches behavior; must meet all 3 threshold conditions) |

**Promotion pipeline:**
session → session log (`/wrapup`) → `memory/` files (`/recap`) → `MEMORY.md` Critical Behaviors (`/learn`)

**Rules:**
- `/wrapup` writes session logs only — does not promote to `memory/`
- `/learn` writes to `memory/` immediately; only skill that writes to MEMORY.md Critical Behaviors
- `/recap` batch-promotes from session logs → `memory/` only — does NOT write to MEMORY.md
- Only behaviors applying every session with high-impact failure if missed → MEMORY.md Critical Behaviors

---

## Get Started

### Option 1 — Fresh vault (recommended)

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/kengio/onebrain/main/install.sh | bash
```

**Windows (PowerShell):**

```powershell
irm https://raw.githubusercontent.com/kengio/onebrain/main/install.ps1 | iex
```

> Or clone manually: `git clone https://github.com/kengio/onebrain.git`

1. **Open in Obsidian** — Open folder as vault, install community plugins when prompted
2. **Start your agent** — Open the terminal plugin, run `claude` or `gemini`
3. **Run `/onboarding`** — 2 minutes to personalize your vault and AI assistant

---

### Option 2 — Add to existing vault

Run from within your existing vault in Claude Code:

```
/plugin marketplace add kengio/onebrain
/plugin install onebrain@onebrain
```

Then run `/onboarding`.

---

> **After `/update`:** Run `/reload-plugins` to pick up changes in your current session, or simply start a new session.

---

## Supported Agents

| Agent | Instruction file | Setup |
|-------|-----------------|-------|
| Claude Code | `CLAUDE.md` | Loaded automatically |
| Gemini CLI | `GEMINI.md` | Loaded automatically |
| Any agent | `AGENTS.md` | Read manually or via system prompt |

---

<a id="commands"></a>

<details>
<summary><strong>📋 24+ Commands</strong></summary>
<br>

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
| `/import [path]` | Import local files (PDF, Word, images, scripts) into vault notes |
| `/reading-notes` | Turn a book or article into structured notes |
| `/weekly` | Review the week, surface patterns, set intentions |
| `/daily` | Daily briefing — surfaces tasks and last session context, then saves your focus as a daily note |
| `/recap` | Cross-session synthesis — batch-promote recurring insights from session logs into `memory/` files (does NOT write to MEMORY.md) |
| `/distill [topic]` | Crystallize a completed topic thread into a permanent knowledge note in `03-knowledge/` |
| `/tasks` | Live task dashboard in Obsidian — creates/updates `TASKS.md` with always-current query sections |
| `/moc` | Vault portal in Obsidian — creates/updates `MOC.md` with projects, areas, knowledge, tasks, and pinned links |
| `/wrapup` | Wrap up session — merges any auto-checkpoints and saves full summary to session log |
| `/learn` | Teach the agent something — facts about your world or behavioral preferences |
| `/clone` | Package your agent context for transfer to a new vault |
| `/reorganize` | Migrate flat notes into organized subfolders |
| `/qmd` | Set up fast vault search index — enables semantic search across all notes |
| `/doctor` | Vault + config health check — broken links, orphan notes, stale memory entries, inbox backlog |
| `/update` | Update skills, config, and plugins from GitHub |
| `/help` | List all available commands with descriptions |

</details>

<details>
<summary><strong>📁 Vault Structure</strong></summary>
<br>

Vault folders are created during `/onboarding`.

```
onebrain/
├── 00-inbox/          Raw braindumps and captures (process regularly)
│   └── imports/       Staging area for /import (drop files here)
├── 01-projects/       Active projects with inline tasks
├── 02-areas/          Ongoing responsibilities (health, finances, career...)
├── 03-knowledge/      Your own synthesized thinking and insights
├── 04-resources/      External info — research output, summaries, reference
├── 05-agent/          AI-specific context and memory
│   ├── MEMORY.md      Identity + Active Projects + Critical Behaviors
│   ├── INDEX.md       Index of all memory files (loaded every session)
│   └── memory/        All memory files — behavioral patterns, domain context, project facts
├── 06-archive/        Completed projects and archived areas
├── 07-logs/           Session logs and checkpoints (YYYY/MM/ subfolders)
├── attachments/       Copied files from /import --attach
│   ├── pdf/
│   ├── images/
│   └── video/
├── TASKS.md           Live task dashboard (created by /tasks, opened in Obsidian)
├── MOC.md             Vault portal — Map of Content (created by /moc)
├── CLAUDE.md          Instructions for Claude Code
├── GEMINI.md          Instructions for Gemini CLI
├── AGENTS.md          Universal agent instructions
├── vault.yml          Your vault configuration (created during onboarding)
└── .claude/plugins/   AI skills and hooks
```

The core workflow: capture everything to inbox → process with `/consolidate` → synthesize into knowledge or save as reference → archive what's done.

**`00-inbox/`** — Raw braindumps and captures
Process regularly. Everything unclassified lands here first. The `imports/` subfolder is the staging area for `/import` — copy files there and run `/import` to distill them into vault notes.

**`01-projects/`** — Active work with a clear goal and end date
Examples: `work/Website Redesign.md`, `personal/Japan Trip 2026.md`

**`02-areas/`** — Ongoing responsibilities that never "complete"
Examples: `health/Running Log.md`, `finances/Budget 2026.md`

**`03-knowledge/`** — Your own synthesized thinking
Conclusions, frameworks, and insights you've developed — not raw reference material.
Examples: `productivity/Deep Work Principles.md`, `technology/When to Use Microservices.md`

**`04-resources/`** — External information saved for reference
Output from `/research`, `/summarize`, `/reading-notes`, `/import`, and saved reference material.
Examples: `research/Zettelkasten Method.md`, `code-snippets/Go HTTP Middleware.md`

**`05-agent/`** — Your agent's portable mind
Everything the AI knows about you. Copy this folder to move your agent to a new vault.
- `MEMORY.md` — Identity + Active Projects + Critical Behaviors — loaded every session
- `INDEX.md` — Index of all memory files — loaded every session alongside MEMORY.md
- `memory/` — All memory files — behavioral patterns, domain context, project facts

**`06-archive/`** — Completed projects and retired areas
Organized by date archived: `06-archive/YYYY/MM/`.

**`07-logs/`** — Session logs and checkpoints
Session logs: `07-logs/YYYY/MM/YYYY-MM-DD-session-NN.md` — generated by `/wrapup` or auto-saved at session end.
Checkpoints: `07-logs/YYYY/MM/YYYY-MM-DD-checkpoint-NN.md` — auto-generated by hooks every 15 messages or 30 minutes, and before context compression. Merged into the session log by `/wrapup`.

</details>

<details>
<summary><strong>🧠 Memory System</strong></summary>
<br>

OneBrain uses a four-tier memory system, where knowledge flows upward as it gets validated:

**Tier 1 — Working memory** (`00-inbox/` + current session)
Everything that hasn't been processed yet. Captures from `/braindump`, `/capture`, and quick notes land here. Process with `/consolidate` to move into the knowledge base.

**Tier 2 — Episodic memory** (`07-logs/`)
Session logs: `YYYY-MM-DD-session-NN.md` in `YYYY/MM/` subfolders. Contains summaries, decisions, insights, and action items from each session. Generated by `/wrapup`.
Checkpoints: `YYYY-MM-DD-checkpoint-NN.md` — auto-generated mid-session by hooks. Merged into the session log by `/wrapup`.

**Tier 3 — Semantic memory** (`05-agent/MEMORY.md` + `05-agent/INDEX.md`)
Always loaded at session start. MEMORY.md holds Identity, Active Projects, and Critical Behaviors — no hard limit, ~55 lines target (3 sections only). INDEX.md lists all memory files in `memory/` and is loaded alongside MEMORY.md. Only `/learn` writes to MEMORY.md Critical Behaviors. Use `/doctor --fix` to audit and repair stale entries.

**Tier 4 — Knowledge base** (`03-knowledge/`, `05-agent/memory/`)
Permanent, searchable notes. `/distill` crystallizes a completed topic thread into a structured note in `03-knowledge/`. `/learn` saves behavioral patterns and domain facts to `memory/`. `/recap` batch-promotes from session logs to `memory/` — does NOT write to MEMORY.md.

### Task Syntax

OneBrain uses the [Obsidian Tasks](https://publish.obsidian.md/tasks/) plugin format:

```
- [ ] Task description 📅 2026-03-25
- [ ] High priority task 🔺 📅 2026-03-22
```

Tasks live inline in your notes — the Tasks plugin surfaces them across the vault. Run `/tasks` to open a live dashboard in Obsidian (`TASKS.md` at vault root) with sections for overdue, due this week, unscheduled, due later, and recently completed.

</details>

<details>
<summary><strong>⚙️ Prerequisites & Detailed Setup</strong></summary>
<br>

### Prerequisites

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

**Recommended for auto-checkpoints:** [Python](https://www.python.org/downloads/) or [Node.js](https://nodejs.org) — used by the checkpoint hook to build JSON. The hook falls back to a pure-bash implementation if neither is found, but having one in your PATH is more reliable. On Windows, install Python from python.org and ensure "Add to PATH" is checked during setup.

**Windows:** Git for Windows (above) includes Git Bash, which provides the `bash` environment required to run all hooks.

### Community Plugins

These three plugins are pre-configured in vault settings — install them via **Settings → Community plugins → Browse**, then click **Trust author and enable plugins** when prompted:

- **Tasks** — task management with due dates
- **Dataview** — query notes like a database
- **Terminal** — run your AI agent from within Obsidian

These are recommended but optional:

- **Templater** — advanced templates
- **Calendar** — visual calendar view
- **Tag Wrangler** — manage tags across vault
- **QuickAdd** — fast capture workflows
- **Obsidian Git** — version control for your vault

### Claude Code Skills (Optional)

For Obsidian-specific Claude Code skills (markdown, bases, canvas, and more), install the [Obsidian Skills](https://github.com/kepano/obsidian-skills) plugin separately:

```
/plugin marketplace add kepano/obsidian-skills
/plugin install obsidian@obsidian-skills
```

</details>

---

## Customization

Edit `05-agent/MEMORY.md` directly to update your identity, goals, or recurring context at any time. The AI picks up changes on the next session start.

The full set of AI instructions that govern your agent's behavior lives in [`.claude/plugins/onebrain/INSTRUCTIONS.md`](.claude/plugins/onebrain/INSTRUCTIONS.md). You can read it to understand how your agent works. Note that `/update` will overwrite this file — add any session-level customizations to your `CLAUDE.md` instead, so they survive updates.

## Contributing

Pull requests welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
