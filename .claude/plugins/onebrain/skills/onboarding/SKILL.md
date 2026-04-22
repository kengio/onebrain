---
name: onboarding
description: "First-run setup for OneBrain : personalize identity, communication style, and vault configuration. Use only on first install or when the user wants to fully reconfigure OneBrain from scratch — manual only. Do NOT use for: teaching a single preference (use learn), updating system files (use update), or reviewing memory (use memory-review)."
---

## Install Path Detection

At the very start, before any user interaction, detect which install path was used:

Check if `.claude/plugins/onebrain/` exists locally in this vault directory.

**Re-run check:** If `.claude/plugins/onebrain/` exists AND `vault.yml` exists, this is a re-run on an already-configured vault. Tell the user:
> OneBrain is already set up in this vault. Running onboarding again will update your identity and preferences : your notes and vault structure will not change. Continue?

Wait for confirmation. If they confirm, proceed with Path A flow (existing steps). If they decline, stop.

**Path B detected:** If `.claude/plugins/onebrain/` does NOT exist locally:
- If `vault.yml` also exists : warn the user before continuing: `OneBrain vault config (vault.yml) found but plugin files are missing. Proceeding to re-adopt the plugin. Your existing vault.yml will be preserved. If MEMORY.md exists, you'll be asked whether to keep or replace it.`
- Skip to the **Path B** section at the bottom of this skill.

**Path A detected:** If `.claude/plugins/onebrain/` exists locally (and it is a first run or confirmed re-run), continue with the steps below (existing onboarding flow).

---

# OneBrain Onboarding

Welcome to OneBrain! This skill personalizes your vault and sets up your AI chief of staff.

**Run this once when you first set up OneBrain.**

---

## Platform Note

For steps that present a fixed set of choices (personality archetype, communication style), use the `AskUserQuestion` tool if available. If not available, present the options as a numbered list and wait for a text response. Free-text prompts (name, role, goals, context) should always be asked as plain conversational text.

**Detecting availability:** Attempt `AskUserQuestion` on the first choice-based question (personality archetype, Step 5). If it fails or is unavailable, switch to plain-text numbered lists for all remaining choice questions in this skill : do not retry `AskUserQuestion` after a failure.

**Label normalization:** `AskUserQuestion` option labels may include suffixes like "(Recommended)". When mapping a selected label to a stored value, always strip any parenthetical suffix and lowercase the result (e.g., "Friendly (Recommended)" → `friendly`, "Professional (Recommended)" → `professional`).

**`AskUserQuestion` return value** (`multiSelect: false` only : this skill does not use multi-select)**:**
- Returns the selected option's label as a string

---

## Step 1: Welcome

Say:

👋 Welcome to OneBrain — where human and AI thinking become one.

I'm going to ask you a few quick questions to personalize your vault.
This takes about 2 minutes. You can update settings later by editing
`[agent_folder]/MEMORY.md` directly.

Let's start!

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
> What would you like to call me? Pick a name for your AI assistant : for example, Nova, Atlas, Sage, Kai, or anything you like.

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
Store: `agent_personality_description` from the canonical descriptions below : not from the AskUserQuestion option text.

**Canonical personality descriptions (authoritative source for `agent_personality_description`):**
- **professional**: formal language, structured responses, minimal small talk. Uses phrases like "I recommend" and "Consider".
- **friendly**: warm greetings, conversational tone, uses encouragement. Uses phrases like "Great idea!" and "Let's do this".
- **playful**: casual language, humor, creative metaphors. Uses phrases like "Let's roll!" and "Nice one!"

---

## Step 6: Ask Communication Style

Ask two questions back-to-back.

**Question A : Detail level:**

Use `AskUserQuestion` with:
- question: "How much detail do you prefer in my responses?"
- header: "Detail"
- multiSelect: false
- options:
  - label: "Concise (Recommended)", description: "Short answers, bullet points, get to the point"
  - label: "Detailed", description: "Full explanations, context, and reasoning included"

Fallback (if AskUserQuestion unavailable): ask as plain text. Default to Concise if no clear answer.

Store: `detail_level` as `concise` or `detailed`.

**Question B : Tone:**

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

This is optional : they can say "skip" or "nothing".

Wait for response. Store: `recurring_contexts`.

---

## Step 8b: Verify CLAUDE.md pointer

Check the state of root `CLAUDE.md`:
- **File exists and has a line that is exactly** `@.claude/plugins/onebrain/INSTRUCTIONS.md` (line matches exactly after stripping leading/trailing whitespace, and is not inside a comment : not prefixed with `>`, `<!--`, or `#`) → skip silently (already set by install.sh)
- **File exists but does not have that exact line** → append `@.claude/plugins/onebrain/INSTRUCTIONS.md` on a new line at the end
- **File does not exist** → create `CLAUDE.md` with content: `@.claude/plugins/onebrain/INSTRUCTIONS.md`

If the write or append fails, tell the user: "Could not update CLAUDE.md. Please manually add `@.claude/plugins/onebrain/INSTRUCTIONS.md` as a line in your CLAUDE.md : OneBrain will not load without it." Then continue to Step 9.

---

## Step 9: Generate MEMORY.md

**Upgrade scenario:** If `05-agent/MEMORY.md` already exists, skip this step entirely and warn the user:
> MEMORY.md already exists — use /update to migrate to the new structure instead.

Do NOT overwrite existing data.

**Fresh install:** If `05-agent/MEMORY.md` does not exist, write it with personalized content (using the hardcoded default `05-agent` since vault.yml does not exist yet). If the write fails, report the error immediately and tell the user: "Could not write MEMORY.md. Ensure the agent folder is writable and try again." Do not proceed to Step 9b.

> **Note:** vault.yml is not written until Step 11, so this step hardcodes the default agent folder path. Do not change this to use vault.yml : the file doesn't exist yet at this point.

Write `05-agent/MEMORY.md` with exactly 3 sections using the template in `references/memory-template.md`.
Substitute all placeholder values from the interview answers above.

---

## Step 9b: Create MEMORY-INDEX.md

Write `05-agent/MEMORY-INDEX.md` using the template in `references/memory-index-template.md`.
If the write fails, report the error and continue to Step 10 (non-blocking).

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

Write `vault.yml` to the vault root using the template in `references/vault-config-template.md`.


---

## Step 11b: qmd Setup (Optional)

Ask the user using AskUserQuestion:
- question: "Would you like to set up qmd for faster vault search? qmd is a local search engine that makes finding notes much faster."
- header: "qmd Search"
- multiSelect: false
- options:
  - label: "Yes, set up qmd", description: "Recommended : enables faster search, especially as your vault grows"
  - label: "Skip for now", description: "You can always run /qmd setup later"

If user selects "Yes, set up qmd": run the `/qmd setup` flow from `skills/qmd/SKILL.md` (skip the initial confirmation question : they already confirmed). If qmd setup fails for any reason, report the error and continue to Step 12 without stopping onboarding.

If user selects "Skip for now": continue to Step 12.

---

## Step 12: Completion Message

Say:

──────────────────────────────────────────────────────────────
👋 Onboarding Complete
──────────────────────────────────────────────────────────────
  `[agent_folder]/MEMORY.md`   identity and personality saved
  `vault.yml`                  vault configuration saved
  Folders created:             {list of folders created}
  Plugin hooks:                registered ✅
  [If qmd set up:] qmd search: `{collection-name}` ✅

→ Run /daily to see your first briefing.
→ Run /help to see all available commands.

---

# Path B : Existing Vault Onboarding

This section runs when `.claude/plugins/onebrain/` does NOT exist locally (user installed via `/plugin install`).

---

## Path B : Step 0: Adopt plugin into vault

Before any user interaction, copy plugin files from the global cache into the vault.

**1. Locate the cache directory:**

Check both paths : both may exist depending on when the plugin was installed:
- `~/.claude/plugins/cache/onebrain/onebrain/` : installs after marketplace rename
- `~/.claude/plugins/cache/onebrain-local/onebrain/` : legacy installs before rename

Collect all version subdirectories from both paths into a single combined list. If neither path exists or neither contains any version subdirectories, tell the user:
> OneBrain plugin cache not found. Run `/plugin install onebrain@kengio` to install it, then try `/onboarding` again.

Stop here.

**2. Select the latest version:**

From the combined list of all version directories across both cache paths, sort them numerically by each dot-separated component (major, minor, patch) in descending order : do NOT use string sort, as it would rank `1.9.0` above `1.10.0`. Proceed to Step 3 with the highest version.

**3. Validate the source:**

Confirm the selected version subdirectory contains at minimum:
- `.claude-plugin/plugin.json` : plugin manifest
- `skills/onboarding/SKILL.md` : required for onboarding to function

If either is missing, the cache entry is corrupt. Try the next-highest version from the combined list. If all versions across both cache paths fail validation, tell the user:
> Cache exists but all version entries are corrupt or incomplete. Run `/plugin install onebrain@kengio` to reinstall.

Stop here if no valid version found.

**4. Copy to vault:**

Before copying: if `[vault root]/.claude/plugins/onebrain/` already exists (e.g., partial state from a previous failed attempt), delete it entirely before proceeding to ensure a clean install. If the delete fails, tell the user: "Found an existing partial plugin directory but could not remove it. Please delete `[vault root]/.claude/plugins/onebrain/` manually and run `/onboarding` again." Stop here.

Copy the full contents of the selected version subdirectory to `[vault root]/.claude/plugins/onebrain/` (create the directory if it doesn't exist).

If the copy fails partway through:
- Attempt to delete the partially copied `[vault root]/.claude/plugins/onebrain/` directory recursively to avoid leaving a broken state.
- If the delete also fails (e.g., permissions), tell the user: "Copy failed and cleanup also failed. Please delete `[vault root]/.claude/plugins/onebrain/` manually before running `/onboarding` again." Stop here.
- If the delete succeeds, tell the user: "Failed to copy plugin files. Check that you have write permission to `[vault root]/.claude/plugins/` and that there is sufficient disk space." Stop here.

**5. Verify:**

Confirm both sentinel files now exist in the vault:
- `[vault root]/.claude/plugins/onebrain/.claude-plugin/plugin.json`
- `[vault root]/.claude/plugins/onebrain/skills/onboarding/SKILL.md`

If either is missing, delete the partial directory recursively and tell the user: "Copy appeared to succeed but verification failed. Check disk space and try again." Stop here.

**6. Handoff:**

From this point, the project-level copy takes priority over the global cache.

**Pin to vault (run after Step 0 file copy — sequential order required):**

```bash
# 1. Pin installPath to vault FIRST (so cache deletion is safe)
bash ".claude/plugins/onebrain/skills/update/scripts/pin-to-vault.sh" "$PWD"

# 2. THEN delete all cache versions
bash ".claude/plugins/onebrain/skills/update/scripts/clean-plugin-cache.sh"
```

This ensures Claude Code loads from vault on the next `/reload-plugins`. Must be sequential: if cache is deleted before pinning, there is a brief window where installPath points to a deleted path.

---

## Path B : Step 1: Welcome

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

## Path B : Steps 2–8: Personalization

Run Steps 2–8 from the standard onboarding flow above (ask name, role, agent name, personality archetype, detail level, tone, goals, recurring context). Identical behavior. **Do not run Step 8b here** : CLAUDE.md patching is handled in Path B Step 9 below.

---

## Path B : Step 9: Patch CLAUDE.md

Now that plugin files are local (copied in Step 0), the @import path resolves to the project-level file.

Check if `CLAUDE.md` exists in the vault root:

**If it exists and has a line that is exactly** `@.claude/plugins/onebrain/INSTRUCTIONS.md` (line matches exactly after stripping leading/trailing whitespace, and is not inside a comment : not prefixed with `>`, `<!--`, or `#`):
Skip silently : already patched.

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

If any write or append fails, tell the user: "Could not update CLAUDE.md. Please manually add `@.claude/plugins/onebrain/INSTRUCTIONS.md` as a line in your CLAUDE.md : OneBrain will not load without it." Then continue to Step 9b.

---

## Path B : Step 9b: Patch GEMINI.md and AGENTS.md (if present)

For each of `GEMINI.md` and `AGENTS.md`:
- **If it exists and has a line that is exactly** `@.claude/plugins/onebrain/INSTRUCTIONS.md` (not in a comment): skip silently
- **If it exists but does not have that exact live line**: append `@.claude/plugins/onebrain/INSTRUCTIONS.md` on a new line at the end
- **If it does not exist**: skip silently (do not create these files unprompted)

---

## Path B : Step 10: Write MEMORY.md

> **Note:** If `vault.yml` already exists (the edge case where plugin dir was missing), read its `agent` key under the `folders` mapping (i.e., `folders.agent` in dot-notation) to determine the agent folder. If `vault.yml` does not exist, is unreadable, or lacks the `folders.agent` key, default to `[agent_folder]`. If `vault.yml` does not exist yet (normal first-time Path B), use the hardcoded default `05-agent` : vault.yml is not written until Step 12.

Check if `[agent_folder]/MEMORY.md` already exists:

**If it exists:** Skip this step entirely — do NOT overwrite existing data. Warn the user:
> MEMORY.md already exists — use /update to migrate to the new structure instead.

**If it does not exist:** Proceed directly.

Write `[agent_folder]/MEMORY.md` using the same 3-section template and personalization data as Step 9 in the standard Path A flow (Identity & Personality, Active Projects, Critical Behaviors — no other sections).

Also write `[agent_folder]/MEMORY-INDEX.md` using the same template as Step 9b in Path A (empty table, frontmatter cache fields, no `last_review:`).

---

## Path B : Step 11: Create vault folders

Identical to Step 10 in the standard flow, with one difference: only create folders that don't already exist. Skip silently for any folder that is present. Do not report unchanged folders.

---

## Path B : Step 12: Write vault.yml

Check if `vault.yml` already exists in the vault root:

**If it exists:** Check whether it already contains a `stats:` key and a `recap:` key. For any missing block, append it to the end of the file using the same defaults as Step 11 in Path A (`stats:` with commented-out fields; `recap:` with `min_sessions: 6` and `min_frequency: 2`). Tell the user: `Keeping your existing vault.yml` (and mention any blocks added).

**If it does not exist:** Write `vault.yml` using the same template as Step 11 in the standard Path A flow (including `stats:` and `recap:` blocks).


---

## Path B : Step 12b: qmd Setup (Optional)

Identical to Step 11b in Path A. Ask the user whether to set up qmd, and if yes, run the `/qmd setup` flow (skipping its initial confirmation question). Continue to Step 13 regardless of outcome.

---

## Path B : Step 13: Completion message

Say:

──────────────────────────────────────────────────────────────
👋 Onboarding Complete
──────────────────────────────────────────────────────────────
  `[agent_folder]/MEMORY.md`   identity and personality saved
  `vault.yml`                  vault configuration saved
  Folders created:             {list of folders created}
  Plugin hooks:                registered ✅
  [If qmd set up:] qmd search: `{collection-name}` ✅

→ Run /daily to see your first briefing.
→ Run /help to see all available commands.

---

## Known Gotchas

- **Re-run on an already-configured vault.** The skill's re-run check (top of file) fires when both `.claude/plugins/onebrain/` and `vault.yml` exist. It presents the specific prompt "Running onboarding again will update your identity and preferences : your notes and vault structure will not change." Do not skip this guard or replace it with a more alarming message — the skill is designed to be re-runnable safely.

- **Plugin hooks require a Claude Code session restart to activate.** The Stop/PreCompact/PostCompact hooks registered during onboarding take effect on the NEXT session start. If the user runs /wrapup immediately after onboarding and no checkpoint appears, remind them to restart the session.
