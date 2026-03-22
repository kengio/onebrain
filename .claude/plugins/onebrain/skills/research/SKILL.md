---
name: research
description: Research a topic on the web and save a structured note to the resources folder
---

# Research

Research a topic and save the findings as a structured note in your resources folder.

Usage: `/research [topic]`

---

## Step 1: Clarify the Research Goal

If topic is provided, confirm scope. If not, ask:
> What do you want to research?

Then ask:
> What are you trying to figure out? (This helps me focus the research.)

Optional: ask depth preference:
- **Overview** — broad understanding, key points
- **Deep dive** — comprehensive, with sources and nuance
- **Practical** — focused on how-to and actionable takeaways

---

## Step 2: Conduct Research

Search for information on the topic. Look for:
- Authoritative sources (docs, papers, established publications)
- Multiple perspectives if the topic is contested
- Practical examples or case studies
- Recent developments (note dates of sources)

---

## Step 3: Synthesize

Before writing the note, synthesize what you found:
- What's the core answer to the user's question?
- What are the key concepts to understand?
- What's actionable or immediately useful?
- What's uncertain or contested?

---

## Step 4: Choose Subfolder

1. Glob existing subfolders in `04-resources/*/`
2. Suggest a kebab-case subfolder based on the research topic (max 2 levels, e.g. `technology/ai`)
3. Present to user: "I'd file this under `04-resources/[suggested-path]/`. OK?"
   Show existing subfolders as options.
4. Use confirmed path for file creation.

---

## Step 5: Create Research Note

File: `04-resources/[subfolder]/[Topic Name].md` (subfolder confirmed in Step 4)

If a note on this topic already exists (search recursively in `04-resources/**/*.md`), ask whether to create a new one or append a "Research — [Date]" section.

```markdown
---
tags: [research, topic-tag]
created: YYYY-MM-DD
source: /research
sources: [list of key sources]
---

# [Topic Name]

> **Research goal:** [What the user was trying to figure out]

## Overview

[2-3 sentence summary]

## Key Concepts

### [Concept 1]
[Explanation]

### [Concept 2]
[Explanation]

## Key Takeaways

- [Actionable insight 1]
- [Actionable insight 2]
- [Actionable insight 3]

## Open Questions

- [Something the research didn't fully resolve]

## Sources

- [Source 1 — title and context]
- [Source 2 — title and context]

## Related

[[Link to related vault notes]]
```

---

## Step 6: Suggest Follow-Up

After creating the note:
> Research saved to `04-resources/[subfolder]/[Topic Name].md`.
>
> Based on what I found, you might also want to explore:
> - [Related topic 1]
> - [Related topic 2]
>
> Or run `/summarize-url [url]` to go deeper on a specific source.
