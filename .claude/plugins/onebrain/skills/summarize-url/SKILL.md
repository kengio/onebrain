---
name: summarize-url
description: Fetch a URL and create a structured summary note saved to the knowledge base
triggers:
  - /summarize-url
  - summarize-url
  - summarize url
---

# Summarize URL

Fetch a web page and create a structured summary note in your knowledge base.

Usage: `/summarize-url [url]`

---

## Step 1: Get the URL

If provided after the command, use it directly.
If not, ask:
> What URL do you want to summarize?

---

## Step 2: Ask for Context

Optional but helpful:
> Why are you saving this? (e.g., research for a project, reference for later, interesting read)

This context shapes how the summary is framed.

---

## Step 3: Fetch and Read

Fetch the URL content. If it fails:
> I couldn't fetch that URL. You can paste the content directly and I'll summarize it.

Read the full page content.

---

## Step 4: Extract Key Information

Identify:
- **Title** of the article/page
- **Author** and publication date (if available)
- **Core thesis or main point**
- **Key arguments or findings** (3-7 points)
- **Memorable quotes** (1-3 if applicable)
- **Actionable takeaways** (if any)
- **What type of content this is**: article, documentation, paper, blog post, etc.

---

## Step 5: Create Summary Note

Determine the best location:
- `02-knowledge/` — for reference material
- `00-inbox/` — if the user just wants to save it for later without processing

File name: `02-knowledge/[Article Title].md` or `00-inbox/YYYY-MM-DD-[slug].md`

```markdown
---
tags: [source-type, topic-tag]
created: YYYY-MM-DD
source: [URL]
author: [Author Name]
published: [Publication date if known]
---

# [Article Title]

> **Source:** [URL]
> **Saved:** YYYY-MM-DD
> **Why I saved this:** [User's context, if provided]

## Summary

[2-3 sentence summary of the main point]

## Key Points

- [Point 1]
- [Point 2]
- [Point 3]

## Notable Quotes

> "[Quote]"
> — [Author/Source]

## My Takeaways

[Leave blank for the user to fill in, or ask if they want to add any now]

## Related

[[Link to related vault notes]]
```

---

## Step 6: Suggest Links

Scan `02-knowledge/` for notes related to the article's topic.

> Summary saved to `02-knowledge/[Title].md`.
>
> This looks related to:
> - [[Related Note 1]] — [why]
> - [[Related Note 2]] — [why]
>
> Want me to add links?
