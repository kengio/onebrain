---
name: onboarding
description: First-run setup for OneBrain — personalize identity, communication style, and vault configuration
---

# OneBrain Onboarding

Welcome to OneBrain! This skill personalizes your vault and sets up your AI chief of staff.

**Run this once when you first set up OneBrain.**

---

## Platform Note

For steps that present a fixed set of choices (vault method, personality archetype, communication style), use the `AskUserQuestion` tool if available. If not available, present the options as a numbered list and wait for a text response. Free-text prompts (name, role, goals, context) should always be asked as plain conversational text.

**Detecting availability:** Attempt `AskUserQuestion` on the first choice-based question (vault method, Step 4). If it fails or is unavailable, switch to plain-text numbered lists for all remaining choice questions in this skill — do not retry `AskUserQuestion` after a failure.

**Label normalization:** `AskUserQuestion` option labels may include suffixes like "(Recommended)". When mapping a selected label to a stored value, always strip any parenthetical suffix and lowercase the result (e.g., "Friendly (Recommended)" → `friendly`, "OneBrain (Recommended)" → `onebrain`).

**`AskUserQuestion` return values:**
- `multiSelect: false` → returns the selected option's label as a string

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

## Step 4: Choose Vault Organization Method

Use `AskUserQuestion` with:
- question: "How would you like your vault organized?"
- header: "Vault method"
- multiSelect: false
- options:
  - label: "OneBrain (Recommended)", description: "Simple and practical. Best for general-purpose note-taking and getting things done.", preview: "00-inbox/       Raw captures (process regularly)\n01-projects/    Active projects with tasks\n02-knowledge/   Consolidated notes & reference\n03-archive/     Completed & inactive items\n04-memory-log/  Session summaries"
  - label: "PARA", description: "Organize by actionability (Tiago Forte). Best for action-oriented people managing work + life.", preview: "00-inbox/       Raw captures (process regularly)\n01-projects/    Active projects with deadlines\n02-areas/       Ongoing responsibilities\n03-resources/   Topics of interest & reference\n04-archive/     Inactive items\n05-memory-log/  Session summaries"
  - label: "Zettelkasten", description: "Build a knowledge graph (Niklas Luhmann). Best for researchers, writers, and deep thinkers.", preview: "00-fleeting/    Temporary raw ideas\n01-literature/  Notes from sources you've read\n02-permanent/   Atomic linked notes (your graph)\n03-archive/     Inactive items\n04-memory-log/  Session summaries"

Fallback (if AskUserQuestion unavailable): present as a numbered list and wait for response. Default to OneBrain if no clear answer.

If the user wants a custom method: explain that only the three listed methods are supported for automatic vault setup. Ask them to choose one of the three options. If they still decline, default to OneBrain.

Store: `method` as one of `onebrain`, `para`, `zettelkasten` (lowercase, no suffix).
Store: `method_display_name` as `OneBrain`, `PARA`, or `Zettelkasten` (the human-readable label for the chosen method).

---

## Step 5: Ask Agent Name

Ask:
> What would you like to call me? Pick a name for your AI assistant — for example, Nova, Atlas, Sage, Kai, or anything you like.

Wait for response. Store: `agent_name`.

---

## Step 6: Choose Personality Archetype

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

## Step 7: Ask Communication Style

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

Store: `detail_level` as "Concise" or "Detailed" (lowercase the stored value).

**Question B — Tone:**

Use `AskUserQuestion` with:
- question: "What tone do you prefer?"
- header: "Tone"
- multiSelect: false
- options:
  - label: "Casual (Recommended)", description: "Informal, conversational, relaxed"
  - label: "Formal", description: "Professional, structured, precise"

Fallback (if AskUserQuestion unavailable): ask as plain text. Default to Casual if no clear answer.

Store: `tone` as "Casual" or "Formal" (lowercase the stored value).

---

## Step 8: Ask Primary Goals

Ask:
> What are 1-3 things you're most focused on right now? (These help me prioritize what's important when I surface suggestions.)

Examples: shipping a product, learning a skill, writing a book, building a habit, managing a team.

Wait for response. Store: `goals` as a list.

---

## Step 9: Ask Stack/Context (Optional)

Ask:
> Anything else I should always keep in mind? For example: your tech stack, key tools you use, recurring commitments, or anything that gives me context.

This is optional — they can say "skip" or "nothing".

Wait for response. Store: `recurring_contexts`.

---

## Step 10: Generate MEMORY.md

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

## Step 11: Create Vault Folders

Based on the chosen method, create the listed folders. For each folder, check if it exists first; if not, create it and write an empty `.gitkeep` file inside it.

**OneBrain (method = onebrain):**
```
00-inbox/
01-projects/
02-knowledge/
03-archive/
04-memory-log/
```

**PARA (method = para):**
```
00-inbox/
01-projects/
02-areas/
03-resources/
04-archive/
05-memory-log/
```

**Zettelkasten (method = zettelkasten):**
```
00-fleeting/
01-literature/
02-permanent/
03-archive/
04-memory-log/
```

---

## Step 12: Apply Folder Reference Replacements

If `method` is `onebrain`, skip this step — no replacements needed.

Otherwise, update all folder path references across the vault's system files. This ensures skills, hooks, and instruction files use the correct folder names.

**Files to update:**
- `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`
- All `.md` files under `.claude/plugins/onebrain/` (skills, hooks, agents)

**Important:** Do NOT replace references inside `skills/onboarding/SKILL.md` or `skills/update/SKILL.md` — these files contain hardcoded default names as templates and must stay unmodified so future onboardings and updates work correctly.

Use your file editing tools (Read, Edit) to make these replacements — do not use shell commands. This ensures the step works on all platforms (macOS, Linux, Windows).

**For PARA:**

In `CLAUDE.md`, `GEMINI.md`, and `AGENTS.md`, replace all occurrences of:
- `02-knowledge/` → `03-resources/`
- `03-archive/` → `04-archive/`
- `04-memory-log/` → `05-memory-log/`
- "Consolidated notes, insights, and reference material" → "Topics of interest and reference material"
- "Completed projects and old items" → "Inactive items from any category"
- "Completed projects and archived items" → "Inactive items from any category"

Also insert a line for `02-areas/` in the vault structure sections (PARA adds a folder with no OneBrain counterpart):
- In `CLAUDE.md`, `GEMINI.md`, and `AGENTS.md`: add `02-areas/        Ongoing responsibilities (health, finance, career)` immediately after the `01-projects/` line in the vault structure code block

In all `.md` files under `.claude/plugins/onebrain/` (excluding `skills/onboarding/SKILL.md` and `skills/update/SKILL.md`), replace all occurrences of:
- `02-knowledge/` → `03-resources/`
- `03-archive/` → `04-archive/`
- `04-memory-log/` → `05-memory-log/`

**For Zettelkasten:**

In `CLAUDE.md`, `GEMINI.md`, and `AGENTS.md`, replace all occurrences of:
- `00-inbox/` → `00-fleeting/`
- `01-projects/` → `01-literature/`
- `02-knowledge/` → `02-permanent/`
- "Raw braindumps and quick captures (process regularly)" → "Temporary capture — raw ideas and quick notes"
- "Active projects with tasks and notes" → "Notes from sources you've read"
- "Consolidated notes, insights, and reference material" → "Atomic, linked notes — your knowledge graph"

In all `.md` files under `.claude/plugins/onebrain/` (excluding `skills/onboarding/SKILL.md` and `skills/update/SKILL.md`), replace all occurrences of:
- `00-inbox/` → `00-fleeting/`
- `01-projects/` → `01-literature/`
- `02-knowledge/` → `02-permanent/`

After completing all replacements, tell the user: "Applied [method_display_name] folder structure to all system files."

---

## Step 13: Write vault.yml

Write `vault.yml` to the vault root with the chosen method and folder mapping.

**OneBrain:**
```yaml
method: onebrain
folders:
  inbox: 00-inbox
  projects: 01-projects
  knowledge: 02-knowledge
  archive: 03-archive
  memory_log: 04-memory-log
```

**PARA:**
```yaml
method: para
folders:
  inbox: 00-inbox
  projects: 01-projects
  areas: 02-areas
  knowledge: 03-resources
  archive: 04-archive
  memory_log: 05-memory-log
```

**Zettelkasten:**
```yaml
method: zettelkasten
folders:
  inbox: 00-fleeting
  projects: 01-literature
  knowledge: 02-permanent
  archive: 03-archive
  memory_log: 04-memory-log
```

---

## Step 14: Completion Message

Say:

> You're all set, [preferred_name]! I'm [agent_name] and I'm ready to help. Here's what's set up:
>
> - Your identity and personality are saved in MEMORY.md
> - Your vault is organized using the **[method_display_name]** method with these folders:
>   [list each folder created in Step 11 for the chosen method, one per line]
>
> **First things to try:**
> - `/braindump` — dump anything on your mind right now
> - `/capture` — add a quick note or idea
> - `/research [topic]` — research something and save it to your vault
>
> When you're done working, run `/wrapup` to save a session summary.
>
> What would you like to do first?
