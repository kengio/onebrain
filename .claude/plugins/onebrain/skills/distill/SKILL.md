---
name: distill
description: "Aggregate already-vaulted notes from multiple sessions or sources on a specific topic into a single structured digest note. Use when the user wants to synthesize a completed research thread — 'distill everything I know about X', 'crystallize my notes on Y'. Do NOT use for: promoting session insights to memory (use recap), writing today's session summary (use wrapup), or clearing raw inbox items (use consolidate — distill works on notes already in the vault)."
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

## Step 2: Gather Source Material

Search across the vault for notes related to the topic. Use 2–3 specific keywords or phrases from the topic (prefer proper nouns and multi-word phrases over generic single words):

Use qmd if available for content searches; Grep/Glob as fallback.

1. **Session logs**: Search `[logs_folder]/session/**/*-session-*.md` for topic keywords — extract matching `## Key Decisions`, `## Action Items`, `## Open Questions` sections. (Post-v2.4.0: session logs live under `session/` only; the `-session-` infix is now defense-in-depth.)
2. **Inbox**: Search `[inbox_folder]/*.md` for related content
3. **memory/ files**: Search `[agent_folder]/memory/` for related entries — match topic keywords against filename and frontmatter `topics:` field
4. **Project/knowledge notes**: Search `[projects_folder]/**/*.md`, `[knowledge_folder]/**/*.md`, and `[resources_folder]/**/*.md` — filter by note title or first 100 words

Report to user (N = total matches across all sources; Q = project/knowledge/resource notes combined):
Found {N} sources: {M} session logs, {P} inbox notes, {Q} knowledge notes

**If N = 0:** Stop and inform the user:
🔴 No notes found matching '{topic}'. Try a broader keyword or check the topic name.

Exit — do not proceed to Step 3.

**If N > 20:** Too many results — the keywords may be too broad. Use AskUserQuestion:
> Found N sources for '[topic]' — that's a lot. Do you want to:
> 1. Narrow the scope (I'll ask for more specific keywords or a date range)
> 2. Continue with all N sources

If user picks option 1, call AskUserQuestion immediately (do not wait or proceed):
> Please provide more specific keywords or a date range (e.g. "focus on MCP setup decisions from March 2026"):

Use the user's answer as refined search criteria and re-run the search from the top of Step 2. If the refined search still returns > 20 sources, inform the user and proceed with all N rather than asking again (one clarification cycle maximum). If user picks option 2 (continue with all N), proceed.

---

## Step 3: Synthesize

Extract and consolidate across all sources:
- **Core question** — what was being explored or decided?
- **What we found** — key findings, facts, conclusions
- **Key decisions made** — explicit choices that were committed to
- **Lessons** — generalizable insights worth keeping long-term
- **Open questions** — still unresolved as of the most recent source
- **Entities involved** — tools, projects, people mentioned

Present a brief synthesis preview to the user before writing.

---

## Step 4: Choose Destination

Suggest a subfolder in `[knowledge_folder]/`:
- Infer topic category (e.g. "OneBrain memory architecture" → `[knowledge_folder]/ai-systems/`)
- Present to user using AskUserQuestion: "I'd file this under `[knowledge_folder]/[suggested-path]/`. OK, or would you like a different path?"
- If user declines, ask for the preferred path or subfolder name before proceeding.
- If user cancels entirely, offer one more option via AskUserQuestion: "Save a draft to `[inbox_folder]/YYYY-MM-DD-[topic]-draft.md` instead?" If yes, save the Step 4 synthesis there. If no, discard.
- Use the confirmed path for file creation.

---

## Step 5: Write the Digest Note

**Before writing:** Check if `[knowledge_folder]/[subfolder]/[Topic].md` already exists.

- If the file **does not exist**: create it.
- If the file **already exists**: use AskUserQuestion to ask:
  > A distilled note for "[Topic]" already exists. How do you want to handle this?
  > 1. Overwrite — replace with a fresh synthesis
  > 2. Append — add a `## Update — YYYY-MM-DD` section with new findings
  > 3. Cancel

  If **Append** is chosen: before writing new content, read the existing digest note and check for any lessons that appear hedged or uncertain in phrasing (e.g. "might", "possibly", "unclear if", or legacy `[conf:low]` markers). If any exist, surface them:
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

[Generalizable insights — use /learn to promote to memory/]
- [list generalizable insights]

## Open Questions

[Still unresolved]

## Related

[[link to related notes]]
```

---

Say:
──────────────────────────────────────────────────────────────
🧪 Distilled
──────────────────────────────────────────────────────────────
`{knowledge_folder}/{subfolder}/{Title}.md`

→ To promote a lesson to long-term memory: /learn [lesson text]

---

## Step 6: Update qmd Index

```
onebrain qmd-reindex
```

---

## Step 7: Write Log Entry

Follow `../_shared/audit-log-format.md` (canonical frontmatter, append-per-day algorithm, run-section heading, failure mode) with:

- **Filename:** `YYYY-MM-DD-distill-{slug}.md` — one file per (topic, day). Same topic same day → append a new `## Run HH:MM` section. Different topics same day produce separate files.
- **Tags:** `[audit-log, distill]`
- **Skill:** `/distill`
- **Per-skill discriminators in frontmatter:** `topic: "<full topic verbatim>"`, `slug: "<slug>"`, `destination: "[knowledge_folder]/[subfolder]/[Topic].md"`

### Slug rules (apply in order)

1. Use the topic verbatim — preserve original language (Thai/English mix is fine).
2. **Sanitize invalid filename chars:** replace each of `/ \ : * ? " < > |` → `-`.
3. **Whitespace:** replace ` ` (space) → `-`. Then collapse runs of multiple `-` into a single `-`.
4. **NFC normalize:** apply `slug.normalize('NFC')` (macOS NFD → NFC) before writing — required so Thai filenames match across filesystems.
5. **Truncate to 50 characters** (count chars, not bytes).
6. **Lowercase ASCII letters** (Thai chars have no case — no-op).
7. **Always store the full topic** in frontmatter `topic:` — used to recover the original when the slug is truncated.

Examples:

| Topic | Slug | Filename |
|---|---|---|
| `การจัดการ memory ของ AI agent ใน production` (49 chars) | `การจัดการ-memory-ของ-ai-agent-ใน-production` | `2026-05-10-distill-การจัดการ-memory-ของ-ai-agent-ใน-production.md` |
| `Claude Code hooks: best practices` (33 chars) | `claude-code-hooks-best-practices` (`:` → `-`, lowercased) | `2026-05-10-distill-claude-code-hooks-best-practices.md` |

### Per-skill body template

```markdown
## Run HH:MM

- Sources: {N} session logs, {M} inbox notes, {Q} knowledge notes
- Destination: `[knowledge_folder]/[subfolder]/[Topic].md` ({created / appended / overwritten})

### Synthesis Highlights
- Core question: {…}
- Key decisions: {…}
- Lessons promoted candidates: {N} (use /learn to promote)
- Open questions: {N}
```

The full file (creation form) — frontmatter + heading + first run — looks like:

```markdown
---
tags: [audit-log, distill]
skill: /distill
date: YYYY-MM-DD
topic: "{full topic verbatim}"
slug: "{slug after rules above}"
destination: "[knowledge_folder]/[subfolder]/[Topic].md"
---

# Distill — {topic} — YYYY-MM-DD

## Run HH:MM

- Sources: {N} session logs, {M} inbox notes, {Q} knowledge notes
- Destination: `[knowledge_folder]/[subfolder]/[Topic].md` ({created / appended / overwritten})

### Synthesis Highlights
- Core question: {…}
- Key decisions: {…}
- Lessons promoted candidates: {N} (use /learn to promote)
- Open questions: {N}
```

---

## Progress reporting

This skill is long-running. Emit a 1-line status update after each major step so the user can see progress in real time.

**In-session format:**

```
→ [step N/M] <action being taken>
```

**Examples:**

```
→ [step 1/5] identifying topic sources via qmd...
→ [step 2/5] reading 9 source notes...
→ [step 3/5] clustering themes...
→ [step 4/5] drafting digest...
→ [step 5/5] writing to 03-knowledge/ + linking...
```

**Rules:**
- Emit one line per major step (NOT per sub-step or tool call)
- M = total steps known up front (count them before starting)
- Status lines use `→ [step N/M]` prefix exactly so they're visually distinct from skill output
- Do NOT emit heartbeats for fast operations (< 5 seconds)

---

## Known Gotchas

- **`synthesized_from_checkpoints: true` logs are recovery summaries.** Checkpoint-synthesized session logs contain less detail than manually written ones — they summarize what was captured by the hook, not a full session review. Treat them as supporting context rather than authoritative sources when distilling decisions.

- **The `> 20 sources` guard does not re-apply after refinement.** If the user refines the search and gets 18 results, proceed — do not re-apply the guard to the refined set if the user already approved or narrowed it.

- **Case-insensitive filename check for existing digest notes.** `Machine Learning.md` and `machine learning.md` represent the same topic. Check case-insensitively when determining if a digest note already exists before deciding to create vs. append.
