---
name: summarize-url
description: Fetch a URL and create a structured summary note saved to the knowledge base
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

## Step 5: Choose Subfolder

**Skip this step if saving to `00-inbox/`.**

For notes going to `02-knowledge/`:
1. Glob existing subfolders in `02-knowledge/*/`
2. Suggest a kebab-case subfolder based on the article's topic (max 2 levels, e.g. `productivity/tools`)
3. Present to user: "I'd file this under `02-knowledge/[suggested-path]/`. OK?"
4. Use confirmed path for file creation.

---

## Step 6: Create Summary Note

Determine the best location:
- `02-knowledge/[subfolder]/` — for reference material (subfolder confirmed in Step 5)
- `00-inbox/` — if the user just wants to save it for later without processing

File name: `02-knowledge/[subfolder]/[Article Title].md` or `00-inbox/YYYY-MM-DD-[slug].md`

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

## Step 7: Suggest Links

Scan `02-knowledge/**/*.md` for notes related to the article's topic.

> Summary saved to `02-knowledge/[subfolder]/[Title].md`.
>
> This looks related to:
> - [[Related Note 1]] — [why]
> - [[Related Note 2]] — [why]
>
> Want me to add links?
