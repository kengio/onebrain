---
name: onboarding
description: First-run setup for OneBrain — personalize identity, communication style, and vault configuration
---

# OneBrain Onboarding

Welcome to OneBrain! This skill personalizes your vault and sets up your AI chief of staff.

**Run this once when you first set up OneBrain.**

---

## Platform Note

For steps that present a fixed set of choices (personality archetype, communication style), use the `AskUserQuestion` tool if available. If not available, present the options as a numbered list and wait for a text response. Free-text prompts (name, role, goals, context) should always be asked as plain conversational text.

**Detecting availability:** Attempt `AskUserQuestion` on the first choice-based question (personality archetype, Step 5). If it fails or is unavailable, switch to plain-text numbered lists for all remaining choice questions in this skill — do not retry `AskUserQuestion` after a failure.

**Label normalization:** `AskUserQuestion` option labels may include suffixes like "(Recommended)". When mapping a selected label to a stored value, always strip any parenthetical suffix and lowercase the result (e.g., "Friendly (Recommended)" → `friendly`, "Professional (Recommended)" → `professional`).

**`AskUserQuestion` return value** (`multiSelect: false` only — this skill does not use multi-select)**:**
- Returns the selected option's label as a string

---

## Step 1: Welcome

Say:

> Welcome to OneBrain — your AI-powered second brain inside Obsidian.
>
> I'm going to ask you a few quick questions to personalize your vault. This takes about 2 minutes, and you can always update your settings later by editing MEMORY.md directly.
>
> Let's start!

---

## Step 2: Ask Name

Ask:
> What should I call you?

Wait for response. Store: `preferred_name`.

---

## Step 3: Ask Role

Ask:
> What's your primary role or how do you spend most of your time?

Offer examples if they hesitate: developer, designer, product manager, founder, student, researcher, writer, consultant, or describe your own.

Wait for response. Store: `role`.

---

## Step 4: Ask Agent Name

Ask:
> What would you like to call me? Pick a name for your AI assistant — for example, Nova, Atlas, Sage, Kai, or anything you like.

Wait for response. Store: `agent_name`.

---

## Step 5: Choose Personality Archetype

Use `AskUserQuestion` with:
- question: "What vibe should I have?"
- header: "Personality"
- multiSelect: false
- options:
  - label: "Professional", description: "Formal, efficient, straight to the point. Uses phrases like 'I recommend' and 'Consider'."
  - label: "Friendly (Recommended)", description: "Warm, conversational, encouraging. Uses phrases like 'Great idea!' and 'Let's do this'."
  - label: "Playful", description: "Casual, witty, keeps things light. Uses phrases like 'Let's roll!' and 'Nice one!'"

Fallback (if AskUserQuestion unavailable): present as a numbered list and wait for response. Default to Friendly if no clear answer.

Store: `agent_personality` as one of `professional`, `friendly`, `playful` (lowercase, no suffix).
Store: `agent_personality_description` from the canonical descriptions below — not from the AskUserQuestion option text.

**Canonical personality descriptions (authoritative source for `agent_personality_description`):**
- **professional**: formal language, structured responses, minimal small talk. Uses phrases like "I recommend" and "Consider".
- **friendly**: warm greetings, conversational tone, uses encouragement. Uses phrases like "Great idea!" and "Let's do this".
- **playful**: casual language, humor, creative metaphors. Uses phrases like "Let's roll!" and "Nice one!"

---

## Step 6: Ask Communication Style

Ask two questions back-to-back.

**Question A — Detail level:**

Use `AskUserQuestion` with:
- question: "How much detail do you prefer in my responses?"
- header: "Detail"
- multiSelect: false
- options:
  - label: "Concise (Recommended)", description: "Short answers, bullet points, get to the point"
  - label: "Detailed", description: "Full explanations, context, and reasoning included"

Fallback (if AskUserQuestion unavailable): ask as plain text. Default to Concise if no clear answer.

Store: `detail_level` as `concise` or `detailed`.

**Question B — Tone:**

Use `AskUserQuestion` with:
- question: "What tone do you prefer?"
- header: "Tone"
- multiSelect: false
- options:
  - label: "Casual (Recommended)", description: "Informal, conversational, relaxed"
  - label: "Formal", description: "Professional, structured, precise"

Fallback (if AskUserQuestion unavailable): ask as plain text. Default to Casual if no clear answer.

Store: `tone` as `casual` or `formal`.

---

## Step 7: Ask Primary Goals

Ask:
> What are 1-3 things you're most focused on right now? (These help me prioritize what's important when I surface suggestions.)

Examples: shipping a product, learning a skill, writing a book, building a habit, managing a team.

Wait for response. Store: `goals` as a list.

---

## Step 8: Ask Stack/Context (Optional)

Ask:
> Anything else I should always keep in mind? For example: your tech stack, key tools you use, recurring commitments, or anything that gives me context.

This is optional — they can say "skip" or "nothing".

Wait for response. Store: `recurring_contexts`.

---

## Step 9: Generate MEMORY.md

Overwrite `MEMORY.md` with personalized content:

```markdown
# OneBrain Memory

<!-- Loaded every session. Keep under ~200 lines. Last updated: [TODAY'S DATE] -->

## Agent Identity

**Name:** [agent_name]
**Personality:** [agent_personality]

## Identity

**Name:** [preferred_name]
**Role:** [role]

## Communication Style

**Tone:** [tone]
**Detail level:** [detail_level]
**Timezone:** [not set]

## Goals & Focus Areas

[For each goal:]
- [goal]

## Values & Working Principles

- Capture everything — if it's not in the vault, it didn't happen
- Bias toward action

## AI Personality Instructions

You are [agent_name], [preferred_name]'s personal chief of staff inside their Obsidian vault.
Your personality is [agent_personality]: [agent_personality_description].

- Introduce yourself as [agent_name] when appropriate
- Address them as [preferred_name]
- Tone: [tone] — [detail_level]
- Role context: [preferred_name] is a [role]
- Always prioritize their top goal: [goals[0]]
- Be proactive: surface relevant connections, flag stale items, suggest next steps
- Keep responses grounded in their vault — reference actual notes when relevant

## Active Projects

<!-- Updated by /consolidate and /braindump -->

## Key Learnings & Patterns

<!-- Added by /wrapup over time -->
<!-- Format: YYYY-MM-DD — [observation] -->

## Recurring Contexts

[If recurring_contexts provided:]
[Each item as a bullet]
[If not provided, leave section empty with the comment]
<!-- Add recurring context here — e.g., "Tuesday = deep work day" or "Main stack: TypeScript, Next.js" -->
```

---

## Step 10: Create Vault Folders

Create the following folders. For each folder, check if it exists first; if not, create it and write an empty `.gitkeep` file inside it.

```
00-inbox/
01-projects/
02-areas/
03-knowledge/
04-resources/
05-agent/
05-agent/context/
05-agent/memory/
06-archive/
07-logs/
```

---

## Step 10b: Write README files

For each root folder, create a `README.md` with the content specified below. Write these files exactly as shown.

Folders that get a README (all 8): `00-inbox/`, `01-projects/`, `02-areas/`, `03-knowledge/`, `04-resources/`, `05-agent/`, `06-archive/`, `07-logs/`

**`00-inbox/README.md`**
```markdown
# Inbox
Quick landing zone for anything unprocessed. If you're not sure where it goes, it goes here.

## Use cases
- A thought that just crossed your mind
- A link you want to read later
- An idea from a conversation
- Raw braindump output from /braindump
- A quick capture from /capture before classification

## Example notes
- 2026-03-23-product-ideas.md
- 2026-03-23-book-recommendation.md
- 2026-03-23-meeting-followup.md

## Not here
- A note you've already processed → 01-projects/, 02-areas/, 03-knowledge/, or 04-resources/
- A session log → 07-logs/
```

**`01-projects/README.md`**
```markdown
# Projects
Active work with a clear goal and end date. When a project is done, archive it.

## Use cases
- Building a feature or product
- Planning an event or trip
- Writing a document, proposal, or article
- Running a short-term campaign or initiative
- Any work that has a "done" state

## Example notes
- work/Website Redesign.md
- personal/Japan Trip 2026.md
- side-projects/CLI Tool v2.md

## Not here
- Ongoing responsibilities with no end date → 02-areas/
- Reference material you didn't write → 04-resources/
```

**`02-areas/README.md`**
```markdown
# Areas
Ongoing responsibilities and life domains that never "complete" — you maintain these indefinitely.

## Use cases
- Health and fitness tracking
- Personal finances and budgeting
- Career development and goals
- Relationships and social commitments
- Home maintenance and logistics

## Example notes
- health/Running Log.md
- finances/Budget 2026.md
- career/Skills Roadmap.md
- relationships/Gift Ideas.md

## Not here
- Work with a deadline and end state → 01-projects/
- External reference material → 04-resources/
```

**`03-knowledge/README.md`**
```markdown
# Knowledge
Your own synthesized thinking — conclusions, frameworks, and insights you've developed.

## Use cases
- An insight you formed after reading several sources
- A mental model you use regularly
- A personal framework or decision heuristic
- Lessons learned from a completed project
- Your evolving opinions on a topic

## Example notes
- productivity/Deep Work Principles.md
- technology/When to Use Microservices.md
- leadership/Feedback Models.md

## Not here
- Someone else's ideas you've saved → 04-resources/
- Active project work → 01-projects/
- Raw captures → 00-inbox/
```

**`04-resources/README.md`**
```markdown
# Resources
External information saved for reference — research output, summaries, how-tos, and reference material.

## Use cases
- Output from /research on a topic
- Summary of a URL from /summarize-url
- Book or article notes from /reading-notes
- Code snippets and cheat sheets
- How-to guides and tutorials

## Example notes
- code-snippets/Go HTTP Middleware.md
- research/Zettelkasten Method.md
- summaries/The Pragmatic Programmer.md

## Not here
- Your own synthesis and conclusions → 03-knowledge/
- Active work → 01-projects/
```

**`05-agent/README.md`**
```markdown
# Agent
AI-specific knowledge and working context. This folder — together with MEMORY.md — is your agent's portable "mind".

## context/
Facts about your world the AI reads when relevant:
- Your domain, stack, and tools
- Your product and target users
- Terminology and naming conventions

## memory/
Behavioral patterns and extended observations the AI has learned:
- Your communication preferences
- Patterns from past sessions
- Things that improve or degrade the AI's responses

## Portability
Copy MEMORY.md + this folder to move your agent to a new vault.
Run /export to package everything neatly — it generates EXPORT.md (a manifest of all context and memory files) and copies everything into agent-export-YYYY-MM-DD/.

## Not here
- Personal notes → 03-knowledge/
- Project work → 01-projects/
```

**`06-archive/README.md`**
```markdown
# Archive
Completed projects and retired areas, organized by date archived.

## Structure
- Single notes: 06-archive/YYYY/MM/Note Name.md
- Projects/areas with multiple notes: 06-archive/YYYY/MM/Project Name/ (folder)

## Use cases
- A project that reached its goal
- An area of life you're no longer maintaining
- Old reference material you want to keep but not see daily

## Example notes
- 2026/03/Lone Reference Note.md               ← single note, flat
- 2026/03/Website Redesign/Overview.md         ← project folder
- 2026/03/Website Redesign/Tasks.md
- 2026/03/Health/Running Log.md                ← retired area folder

## Not here
- Active work → 01-projects/ or 02-areas/
- Notes you want to delete (just delete them)
```

**`07-logs/README.md`**
```markdown
# Logs
Session logs — one file per AI session, organized by year and month.

## Structure
07-logs/YYYY/MM/YYYY-MM-DD-session-NN.md

## Use cases
- Reviewing what you worked on last week
- Finding a decision or insight from a past session
- Input for /weekly reflection

## Example notes
- 2026/03/2026-03-23-session-01.md
- 2026/03/2026-03-23-session-02.md
- 2026/03/2026-03-24-session-01.md

## Not here
- Personal notes or projects — logs are AI session records only
```

---

## Step 11: Write vault.yml

Write `vault.yml` to the vault root with the folder mapping:

```yaml
method: onebrain
folders:
  inbox: 00-inbox
  projects: 01-projects
  areas: 02-areas
  knowledge: 03-knowledge
  resources: 04-resources
  agent: 05-agent
  archive: 06-archive
  logs: 07-logs
```

---

## Step 12: Completion Message

Say:

> You're all set, [preferred_name]! I'm [agent_name] and I'm ready to help. Here's what's set up:
>
> - Your identity and personality are saved in MEMORY.md
> - Your vault is set up with these folders:
>   - `00-inbox/` — raw captures (process regularly)
>   - `01-projects/` — active projects with tasks
>   - `02-areas/` — ongoing responsibilities (health, finances, career...)
>   - `03-knowledge/` — your own synthesized thinking
>   - `04-resources/` — external info, research output, reference
>   - `05-agent/` — AI context and memory
>   - `06-archive/` — completed and archived items
>   - `07-logs/` — session logs
>
> **First things to try:**
> - `/braindump` — dump anything on your mind right now
> - `/capture` — add a quick note or idea
> - `/research [topic]` — research something and save it to your vault
>
> **How notes are organized:** Project and area notes go into kebab-case subfolders (e.g. `01-projects/work/Website Redesign.md`). I'll suggest a subfolder whenever you create a note — just confirm or adjust. Research and summary output goes to `04-resources/` — use `/consolidate` to turn it into your own thinking in `03-knowledge/`. Use `/learn` to teach me things about your world (domain, tools, terminology) and I'll save them to `05-agent/`. Session logs go into `07-logs/YYYY/MM/` and archive items go into `06-archive/YYYY/MM/`.
>
> When you're done working, run `/wrapup` to save a session summary.
>
> What would you like to do first?
