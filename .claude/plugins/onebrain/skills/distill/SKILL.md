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
- `qmd_collection` → for index update after writing

---

## Step 3: Gather Source Material

Search across the vault for notes related to the topic:

1. **Session logs**: Grep `[logs_folder]/**/*.md` for topic keywords — extract matching `## Key Decisions`, `## Action Items`, `## Open Questions` sections
2. **Inbox**: Grep `00-inbox/*.md` for related content
3. **MEMORY.md**: Grep `[agent_folder]/MEMORY.md` Key Learnings for related entries
4. **Project/knowledge notes**: Glob relevant folders, read notes that match

Report to user:
> Found N sources: M session logs, P inbox notes, Q knowledge notes

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
- Present to user: "I'd file this under `[knowledge_folder]/[suggested-path]/`. OK?"
- Use confirmed path for file creation.

---

## Step 6: Write the Digest Note

Create `[knowledge_folder]/[subfolder]/[Topic].md`:

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

## Open Questions

[Still unresolved]

## Related

[[link to related notes]]
```

---

## Step 7: Promote Lessons to MEMORY.md

For each lesson marked `[conf:high]` or `[conf:medium]`:
- Check if it already exists in `[agent_folder]/MEMORY.md` Key Learnings (dedup)
- If genuinely new, append in format: `- YYYY-MM-DD — [observation] \`[conf:X]\` \`[verified:YYYY-MM-DD]\``
- Update `updated:` frontmatter in MEMORY.md

Report:
> Distilled into `[path]`. Added N lessons to MEMORY.md.

---

## Step 8: Update qmd Index

If `qmd_collection` is set in vault.yml, run:
```bash
qmd update -c [qmd_collection]
```
