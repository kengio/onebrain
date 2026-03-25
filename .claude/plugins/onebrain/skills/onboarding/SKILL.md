---
name: onboarding
description: First-run setup for OneBrain — personalize identity, communication style, and vault configuration
---

## Install Path Detection

At the very start, before any user interaction, detect which install path was used:

Check if `.claude/plugins/onebrain/` exists locally in this vault directory.

**Re-run check:** If `.claude/plugins/onebrain/` exists AND `vault.yml` exists, this is a re-run on an already-configured vault. Tell the user:
> OneBrain is already set up in this vault. Running onboarding again will update your identity and preferences — your notes and vault structure will not change. Continue?

Wait for confirmation. If they confirm, proceed with Path A flow (existing steps). If they decline, stop.

**Path B detected:** If `.claude/plugins/onebrain/` does NOT exist locally:
- If `vault.yml` also exists — warn the user before continuing: `OneBrain vault config (vault.yml) found but plugin files are missing. Proceeding to re-adopt the plugin. Your existing vault.yml and MEMORY.md will be preserved.`
- Skip to the **Path B** section at the bottom of this skill.

**Path A detected:** If `.claude/plugins/onebrain/` exists locally (and it is a first run or confirmed re-run), continue with the steps below (existing onboarding flow).

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

> Welcome to OneBrain — where human and AI thinking become one.
>
> I'm going to ask you a few quick questions to personalize your vault. This takes about 2 minutes, and you can always update your settings later by editing `05-agent/MEMORY.md` directly.
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

## Step 8b: Verify CLAUDE.md pointer

Check the state of root `CLAUDE.md`:
- **File exists and has a line that is exactly** `@.claude/plugins/onebrain/INSTRUCTIONS.md` (not in a comment, not prefixed with `>` or `<!--`) → skip silently (already set by install.sh)
- **File exists but does not have that exact line** → append `@.claude/plugins/onebrain/INSTRUCTIONS.md` on a new line at the end
- **File does not exist** → create `CLAUDE.md` with content: `@.claude/plugins/onebrain/INSTRUCTIONS.md`

No user interaction needed for this step.

---

## Step 9: Generate MEMORY.md

Write `05-agent/MEMORY.md` with personalized content.

> **Note:** vault.yml is not written until Step 11, so this step hardcodes `05-agent` as the agent folder. Do not change this to use vault.yml — the file doesn't exist yet at this point.

```markdown
---
tags: [agent-memory]
created: [TODAY'S DATE]
updated: [TODAY'S DATE]
---

# OneBrain Memory

<!-- Loaded every session. Keep under ~200 lines. -->

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
00-inbox/imports/      ← staging area for /import (files to be processed)
01-projects/
02-areas/
03-knowledge/
04-resources/
05-agent/              ← root folder
05-agent/context/      ← subfolder only (no README)
05-agent/memory/       ← subfolder only (no README)
06-archive/
07-logs/
attachments/           ← copied files when using /import --attach
attachments/pdf/
attachments/images/
attachments/video/
```

---

## Step 11: Write vault.yml

Write `vault.yml` to the vault root with the folder mapping:

```yaml
method: onebrain
folders:
  inbox: 00-inbox
  import_inbox: 00-inbox/imports
  attachments: attachments
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
> - Your identity and personality are saved in `05-agent/MEMORY.md`
> - Your vault is set up with these folders:
>   - `00-inbox/` — raw captures (process regularly); `imports/` subfolder for `/import` staging
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

---

# Path B — Existing Vault Onboarding

This section runs when `.claude/plugins/onebrain/` does NOT exist locally (user installed via `/plugin install`).

---

## Path B — Step 0: Adopt plugin into vault

Before any user interaction, copy plugin files from the global cache into the vault.

**1. Locate the cache directory:**

Check these paths in order (both may exist depending on when the plugin was installed):
- `~/.claude/plugins/cache/onebrain/onebrain/` — installs after marketplace rename
- `~/.claude/plugins/cache/onebrain-local/onebrain/` — legacy installs before rename

Use the first path that exists and contains version subdirectories. If neither exists or neither contains version subdirectories, tell the user:
> OneBrain plugin cache not found. Run `/plugin install onebrain@onebrain` to install it, then try `/onboarding` again.

Stop here.

**2. Select the latest version:**

List the version subdirectories (e.g., `1.2.2/`, `1.3.0/`). Sort them numerically by each dot-separated component (major, minor, patch) in descending order — do NOT use string sort, as it would rank `1.9.0` above `1.10.0`. Select the highest version. If multiple version dirs exist but all fail validation in Step 3, report: "Found [N] version(s) in cache but all failed validation. The cache may be corrupted. Run `/plugin install onebrain@onebrain` to reinstall."

**3. Validate the source:**

Confirm the selected version subdirectory contains at minimum:
- `.claude-plugin/plugin.json` — plugin manifest
- `skills/onboarding/SKILL.md` — required for onboarding to function

If either is missing, the cache entry is corrupt. Try the next-highest version. If all versions fail, report: "Cache exists but all version entries are corrupt or incomplete. Run `/plugin install onebrain@onebrain` to reinstall."

Stop here if no valid version found.

**4. Copy to vault:**

Copy the full contents of the selected version subdirectory to `[vault root]/.claude/plugins/onebrain/` (create the directory if it doesn't exist).

If the copy fails partway through:
- Attempt to delete the partially copied `[vault root]/.claude/plugins/onebrain/` directory to avoid leaving a broken state.
- If the delete also fails (e.g., permissions), tell the user: "Copy failed and cleanup also failed. Please delete `[vault root]/.claude/plugins/onebrain/` manually before running `/onboarding` again." Stop here.
- If the delete succeeds, tell the user: "Failed to copy plugin files. Check that you have write permission to `[vault root]/.claude/plugins/` and that there is sufficient disk space." Stop here.

**5. Verify:**

Confirm both sentinel files now exist in the vault:
- `[vault root]/.claude/plugins/onebrain/.claude-plugin/plugin.json`
- `[vault root]/.claude/plugins/onebrain/skills/onboarding/SKILL.md`

If either is missing, delete the partial directory and tell the user: "Copy appeared to succeed but verification failed. Check disk space and try again." Stop here.

**6.** From this point, the project-level copy takes priority over the global cache.

Stop here if any step above fails.

---

## Path B — Step 1: Welcome

Say:
> Welcome to OneBrain! I'm going to set up OneBrain inside your existing vault. This will:
> - Add OneBrain instructions to your CLAUDE.md
> - Create OneBrain folders alongside your existing notes (only missing folders will be created)
> - Personalize your AI assistant
>
> Your existing notes and CLAUDE.md content will not be modified or removed.
>
> Let's start!

---

## Path B — Steps 2–8: Personalization

Run Steps 2–8 from the standard onboarding flow above (ask name, role, agent name, personality archetype, detail level, tone, goals, recurring context). Identical behavior. **Do not run Step 8b here** — CLAUDE.md patching is handled in Path B Step 9 below.

---

## Path B — Step 9: Patch CLAUDE.md

Now that plugin files are local (copied in Step 0), the @import path resolves to the project-level file.

Check if `CLAUDE.md` exists in the vault root:

**If it exists and has a line that is exactly** `@.claude/plugins/onebrain/INSTRUCTIONS.md` (not inside a comment, not prefixed with `>` or `<!--`):
Skip silently — already patched.

**If it exists but does not have that exact live line:**
Append on a new line at the end (after a blank line):
```
@.claude/plugins/onebrain/INSTRUCTIONS.md
```
Do not modify any existing content.
Tell the user: `Added OneBrain instructions to your CLAUDE.md. Your existing content is untouched.`

**If it does not exist:**
Create `CLAUDE.md` with content:
```
@.claude/plugins/onebrain/INSTRUCTIONS.md
```
Tell the user: `Created CLAUDE.md with OneBrain instructions.`

---

## Path B — Step 9b: Patch GEMINI.md and AGENTS.md (if present)

For each of `GEMINI.md` and `AGENTS.md`:
- **If it exists and has a line that is exactly** `@.claude/plugins/onebrain/INSTRUCTIONS.md` (not in a comment): skip silently
- **If it exists but does not have that exact live line**: append `@.claude/plugins/onebrain/INSTRUCTIONS.md` on a new line at the end
- **If it does not exist**: skip silently (do not create these files unprompted)

---

## Path B — Step 10: Write MEMORY.md

> **Note:** If `vault.yml` already exists (the edge case where plugin dir was missing), read its `folders.agent` key to determine the agent folder. If `vault.yml` does not exist yet (normal first-time Path B), use `05-agent` as the agent folder — vault.yml is not written until Step 12.

Check if `[agent_folder]/MEMORY.md` already exists:

**If it exists:** Use `AskUserQuestion` with:
- question: "I found an existing MEMORY.md. What would you like to do?"
- header: "Existing MEMORY.md"
- multiSelect: false
- options:
  - label: "Keep existing", description: "Keep your current identity settings unchanged"
  - label: "Overwrite", description: "Replace with the new settings from this onboarding"

If they choose Keep, skip this step. If they choose Overwrite, proceed.

**If it does not exist:** Proceed directly.

Write `[agent_folder]/MEMORY.md` using the same template and personalization data as Step 9 in the standard Path A flow.

---

## Path B — Step 11: Create vault folders

Identical to Step 10 in the standard flow, with one difference: only create folders that don't already exist. Skip silently for any folder that is present. Do not report unchanged folders.

---

## Path B — Step 12: Write vault.yml

Check if `vault.yml` already exists in the vault root:

**If it exists:** Skip — preserve the existing vault configuration. Tell the user: `Keeping your existing vault.yml.`

**If it does not exist:** Write `vault.yml` using the same template as Step 11 in the standard Path A flow.

---

## Path B — Step 13: Completion message

Say:
> You're all set, [preferred_name]! I'm [agent_name] and I'm ready to help.
>
> OneBrain is now bundled inside your vault:
> - Plugin files copied to `.claude/plugins/onebrain/`
> - [If Step 9 appended: "OneBrain instructions added to `CLAUDE.md`"] [If Step 9 created: "`CLAUDE.md` created with OneBrain instructions"] [If Step 9 skipped: "OneBrain instructions already present in `CLAUDE.md`"]
> - Your identity saved in `05-agent/MEMORY.md`
> - Vault folders created (existing folders untouched)
>
> Use `/update` to keep OneBrain current — it works the same as a fresh vault install.
>
> The global plugin install is no longer needed for this vault. You can remove it with `/plugin uninstall onebrain@onebrain` if you like, but it's safe to leave as-is.
>
> What would you like to do first?
