---
name: distill
description: Aggregate notes from multiple sessions or sources on a specific topic into a single structured digest note in the knowledge base
---

# Distill

Take a completed research thread, brainstorming topic, or recurring theme and compress it into a single, structured knowledge note. Unlike /wrapup (session-focused), /distill is topic-focused and spans multiple sessions.

Usage: `/distill [topic]`

---

## Step 1: Identify the Topic

If a topic was provided after the command, use it directly.
If not, ask:
> What topic do you want to distill? (e.g. "OneBrain memory architecture", "Mac Mini purchase decision", "MCP server setup")

---

## Step 2: Read vault.yml

Extract:
- `folders.logs` → `[logs_folder]` (default: `07-logs`)
- `folders.knowledge` → `[knowledge_folder]` (default: `03-knowledge`)
- `folders.agent` → `[agent_folder]` (default: `05-agent`)
- `folders.inbox` → `[inbox_folder]` (default: `00-inbox`)
- `folders.projects` → `[projects_folder]` (default: `[projects_folder]`)
- `folders.resources` → `[resources_folder]` (default: `04-resources`)
- `qmd_collection` → for index update after writing

---

## Step 3: Gather Source Material

Search across the vault for notes related to the topic. Use 2–3 specific keywords or phrases from the topic (prefer proper nouns and multi-word phrases over generic single words):

Use qmd if available for content searches; Grep/Glob as fallback.

1. **Session logs**: Search `[logs_folder]/**/*.md` for topic keywords — extract matching `## Key Decisions`, `## Action Items`, `## Open Questions` sections
2. **Inbox**: Search `[inbox_folder]/*.md` for related content
3. **MEMORY.md**: Grep `[agent_folder]/MEMORY.md` Key Learnings for related entries
4. **Project/knowledge notes**: Search `[projects_folder]/**/*.md`, `[knowledge_folder]/**/*.md`, and `[resources_folder]/**/*.md` — filter by note title or first 100 words

Report to user (N = total matches across all sources; Q = project/knowledge/resource notes combined):
> Found N sources: M session logs, P inbox notes, Q knowledge notes

**If N = 0:** Stop and inform the user:
> No notes found matching '[topic]'. Try a broader keyword or check the topic name.

Exit — do not proceed to Step 4.

**If N > 20:** Too many results — the keywords may be too broad. Use AskUserQuestion:
> Found N sources for '[topic]' — that's a lot. Do you want to:
> 1. Narrow the scope (I'll ask for more specific keywords or a date range)
> 2. Continue with all N sources

If user picks option 1, call AskUserQuestion immediately (do not wait or proceed):
> Please provide more specific keywords or a date range (e.g. "focus on MCP setup decisions from March 2026"):

Use the user's answer as refined search criteria and re-run the search from the top of Step 3. If the refined search still returns > 20 sources, inform the user and proceed with all N rather than asking again (one clarification cycle maximum). If user picks option 2 (continue with all N), proceed.

---

## Step 4: Synthesize

Extract and consolidate across all sources:
- **Core question** — what was being explored or decided?
- **What we found** — key findings, facts, conclusions
- **Key decisions made** — explicit choices that were committed to
- **Lessons** — generalizable insights worth keeping long-term (assign confidence score)
- **Open questions** — still unresolved as of the most recent source
- **Entities involved** — tools, projects, people mentioned

Present a brief synthesis preview to the user before writing.

---

## Step 5: Choose Destination

Suggest a subfolder in `[knowledge_folder]/`:
- Infer topic category (e.g. "OneBrain memory architecture" → `[knowledge_folder]/ai-systems/`)
- Present to user using AskUserQuestion: "I'd file this under `[knowledge_folder]/[suggested-path]/`. OK, or would you like a different path?"
- If user declines, ask for the preferred path or subfolder name before proceeding.
- If user cancels entirely, offer one more option via AskUserQuestion: "Save a draft to `[inbox_folder]/YYYY-MM-DD-[topic]-draft.md` instead?" If yes, save the Step 4 synthesis there. If no, discard.
- Use the confirmed path for file creation.

---

## Step 6: Write the Digest Note

**Before writing:** Check if `[knowledge_folder]/[subfolder]/[Topic].md` already exists.

- If the file **does not exist**: create it.
- If the file **already exists**: use AskUserQuestion to ask:
  > A distilled note for "[Topic]" already exists. How do you want to handle this?
  > 1. Overwrite — replace with a fresh synthesis
  > 2. Append — add a `## Update — YYYY-MM-DD` section with new findings
  > 3. Cancel

  If **Append** is chosen: before writing new content, read the existing digest note and check for any `[conf:low]` lessons already there. If any exist, surface them:
  > This note has M low-confidence lessons. Want to re-evaluate any before appending? (list them)
  User may promote or leave them as-is. If none exist, skip this silently and proceed to append.

  If **Overwrite** is chosen: read the existing file first to extract its `created:` date — this marks when the topic was first distilled and must be preserved. If no `created:` field exists in the file, use the file's filesystem modification date as a best-effort fallback; if that is also unavailable, use today's date and note the uncertainty in `sources_span`. Update `sources_span` to span from the original start date to today's date.

Create or update `[knowledge_folder]/[subfolder]/[Topic].md`:

```markdown
---
tags: [distilled, topic-tag]
created: YYYY-MM-DD
source: /distill
sources_span: YYYY-MM-DD to YYYY-MM-DD
---

# [Topic]

> **Distilled:** YYYY-MM-DD
> **Sources:** N session logs, M notes

## Core Question

[What was being explored or decided]

## What We Found

[Key findings and conclusions, bullet list]

## Key Decisions

[Explicit decisions made, with dates if known]

## Lessons

[Generalizable insights — candidates for MEMORY.md]
- [Lesson 1] `[conf:high]`
- [Lesson 2] `[conf:medium]`
- [Lesson 3] `[conf:low]`

## Open Questions

[Still unresolved]

## Related

[[link to related notes]]
```

---

Report:
> Distilled into `[path]`.

If you want any lesson to persist in long-term memory, promote it manually:
> To promote a lesson: `/learn [lesson text]`

---

## Step 7: Update qmd Index

If `qmd_collection` is set in vault.yml, run:
```bash
qmd update -c [qmd_collection]
```
