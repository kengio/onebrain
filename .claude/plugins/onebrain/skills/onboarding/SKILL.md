---
name: onboarding
description: First-run setup for OneBrain — personalize identity, communication style, and vault configuration
triggers:
  - /onboarding
  - onboarding
---

# OneBrain Onboarding

Welcome to OneBrain! This skill personalizes your vault and sets up your AI chief of staff.

**Run this once when you first set up OneBrain.**

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
> What's your name? (And what should I call you — full name, nickname, or something else?)

Wait for response. Store: `full_name`, `preferred_name`.

---

## Step 3: Ask Role

Ask:
> What's your primary role or how do you spend most of your time?

Offer examples if they hesitate: developer, designer, product manager, founder, student, researcher, writer, consultant, or describe your own.

Wait for response. Store: `role`.

---

## Step 4: Ask Communication Style

Ask:
> How do you prefer I communicate with you?

Present these options (they can mix):
- **Concise** — short answers, bullet points, get to the point
- **Detailed** — full explanations, context, reasoning included
- **Casual** — informal, conversational, relaxed
- **Formal** — professional, structured, precise

Wait for response. Store: `tone`, `detail_level`.

---

## Step 5: Ask Primary Goals

Ask:
> What are 1-3 things you're most focused on right now? (These help me prioritize what's important when I surface suggestions.)

Examples: shipping a product, learning a skill, writing a book, building a habit, managing a team.

Wait for response. Store: `goals` as a list.

---

## Step 6: Ask Stack/Context (Optional)

Ask:
> Anything else I should always keep in mind? For example: your tech stack, key tools you use, recurring commitments, or anything that gives me context.

This is optional — they can say "skip" or "nothing".

Wait for response. Store: `recurring_contexts`.

---

## Step 7: Generate MEMORY.md

Overwrite `MEMORY.md` with personalized content:

```markdown
---
# OneBrain Memory
# Loaded every session. Keep under ~200 lines.
# Last updated: [TODAY'S DATE]
---

## Identity

**Name:** [full_name]
**Role:** [role]
**Preferred name:** [preferred_name]

## Communication Style

**Tone:** [tone]
**Detail level:** [detail_level]
**Timezone:** [ask or leave blank]

## Goals & Focus Areas

[For each goal:]
- [goal]

## Values & Working Principles

- Capture everything — if it's not in the vault, it didn't happen
- Bias toward action

## AI Personality Instructions

You are [preferred_name]'s personal chief of staff inside their Obsidian vault.

- Address them as [preferred_name]
- Tone: [tone] — [detail_level]
- Role context: [preferred_name] is a [role]
- Always prioritize their top goal: [goals[0]]
- Be proactive: surface relevant connections, flag stale items, suggest next steps
- Keep responses grounded in their vault — reference actual notes when relevant

## Active Projects

<!-- Updated by /consolidate and /braindump -->

## Key Learnings & Patterns

<!-- Added by /tldr over time -->
<!-- Format: YYYY-MM-DD — [observation] -->

## Recurring Contexts

[If recurring_contexts provided:]
[Each item as a bullet]
[If not provided, leave section empty with the comment]
<!-- Add recurring context here — e.g., "Tuesday = deep work day" or "Main stack: TypeScript, Next.js" -->
```

---

## Step 8: Choose Vault Organization Method

Ask:

> How would you like your vault organized? Each method creates different folders:
>
> **1. OneBrain** (default) — simple and practical
> Inbox → Projects → Knowledge → Archive
> Best for: general-purpose note-taking, getting things done
>
> **2. PARA** (Tiago Forte) — organize by actionability
> Inbox → Projects → Areas → Resources → Archive
> Best for: action-oriented people, managing work + life responsibilities
>
> **3. Zettelkasten** (Niklas Luhmann) — build a knowledge graph
> Fleeting → Literature → Permanent → Archive
> Best for: researchers, writers, deep thinkers who want linked atomic notes
>
> Enter 1, 2, or 3 (or press Enter for OneBrain):

Wait for response. Default to OneBrain if user says "1", presses enter, or gives no clear answer.

Store: `method` as one of `onebrain`, `para`, `zettelkasten`.

---

## Step 9: Create Vault Folders

Based on the chosen method, create the listed folders. For each, create the folder and write an empty `.gitkeep` file inside it.

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

For each folder: check if it exists first. If not, create it with a `.gitkeep` file.

---

## Step 10: Apply Folder Reference Replacements

If `method` is `onebrain`, skip this step — no replacements needed.

Otherwise, update all folder path references across the vault's system files. This ensures skills, hooks, and instruction files use the correct folder names.

**Files to update:**
- `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`
- All `.md` files under `.claude/plugins/onebrain/` (skills, hooks, agents)

**Important:** Do NOT replace references inside `skills/onboarding/SKILL.md` or `skills/update/SKILL.md` — these files contain hardcoded default names as templates and must stay unmodified so future onboardings and updates work correctly.

**For PARA**, run:

```bash
# Root instruction files
sed -i '' \
  -e 's|02-knowledge/|02-areas/|g' \
  -e 's|03-archive/|04-archive/|g' \
  -e 's|04-memory-log/|05-memory-log/|g' \
  CLAUDE.md GEMINI.md AGENTS.md

# All plugin files (excluding onboarding and update skills)
find .claude/plugins/onebrain -name "*.md" \
  ! -path "*/skills/onboarding/SKILL.md" \
  ! -path "*/skills/update/SKILL.md" \
  -exec sed -i '' \
    -e 's|02-knowledge/|02-areas/|g' \
    -e 's|03-archive/|04-archive/|g' \
    -e 's|04-memory-log/|05-memory-log/|g' \
  {} +
```

Also update descriptive text in vault structure sections:
- "Consolidated notes, insights, and reference material" → "Ongoing responsibilities and areas of focus"
- "Completed projects and old items" → "Inactive items from any category"

**For Zettelkasten**, run:

```bash
# Root instruction files
sed -i '' \
  -e 's|00-inbox/|00-fleeting/|g' \
  -e 's|01-projects/|01-literature/|g' \
  -e 's|02-knowledge/|02-permanent/|g' \
  CLAUDE.md GEMINI.md AGENTS.md

# All plugin files (excluding onboarding and update skills)
find .claude/plugins/onebrain -name "*.md" \
  ! -path "*/skills/onboarding/SKILL.md" \
  ! -path "*/skills/update/SKILL.md" \
  -exec sed -i '' \
    -e 's|00-inbox/|00-fleeting/|g' \
    -e 's|01-projects/|01-literature/|g' \
    -e 's|02-knowledge/|02-permanent/|g' \
  {} +
```

Also update descriptive text:
- "Raw braindumps and quick captures" → "Temporary capture — raw ideas and quick notes"
- "Active projects with tasks and notes" → "Notes from sources you've read"
- "Consolidated notes, insights, and reference material" → "Atomic, linked notes — your knowledge graph"

After running replacements, tell the user: "Applied [METHOD] folder structure to all system files."

---

## Step 11: Write vault.yml

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
  knowledge: 02-areas
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

## Step 12: Completion Message

Say:

> You're all set, [preferred_name]! Here's what's ready:
>
> - Your identity and personality are saved in MEMORY.md
> - Your vault is organized using the **[METHOD NAME]** method
> - Vault folders have been created and system files updated
>
> **First things to try:**
> - `/braindump` — dump anything on your mind right now
> - `/capture` — add a quick note or idea
> - `/research [topic]` — research something and save it to your vault
>
> When you're done working, run `/tldr` to save a session summary.
>
> What would you like to do first?
