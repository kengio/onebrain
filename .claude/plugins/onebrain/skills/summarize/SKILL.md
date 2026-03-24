---
name: summarize
description: Fetch a URL and create a structured summary note saved to the resources folder. Invoke when user wants to deeply process a link, article, blog post, documentation, or paper into a permanent vault note.
---

# Summarize

Fetch a URL and create a structured summary note in your resources folder.

Usage: `/summarize [url]`

---

## Step 1: Get the URL

If provided after the command, use it directly.

If not, ask:
> What URL do you want to summarize?

---

## Step 2: Check Bookmarks

Resolve the resources folder: read `vault.yml` for `folders.resources`, defaulting to `04-resources`.

Grep `[resources]/Bookmarks.md` for the URL. If found, note it silently — you will offer to remove it after the summary note is saved (Step 7).

---

## Step 3: Ask for Context

Optional but helpful — ask:
> Why are you saving this? (e.g., research for a project, reference for later, interesting read)

This context shapes how the summary is framed.

---

## Step 4: Fetch and Read

Fetch the URL content. If it fails:
> I couldn't fetch that URL. You can paste the content directly and I'll summarize it.

Read the full page content.

---

## Step 5: Extract Key Information

Identify:

- **Title** of the article/page
- **Author** and publication date (if available)
- **Core thesis or main point**
- **Key arguments or findings** (3-7 points)
- **Memorable quotes** (1-3 if applicable)
- **Actionable takeaways** (if any)
- **Content type**: article, documentation, paper, blog post, video transcript, etc.

---

## Step 6: Choose Subfolder and Save

**Resolve subfolder:**

1. Glob existing subfolders in `[resources]/*/`
2. Suggest a kebab-case subfolder based on the article's topic (max 2 levels, e.g. `productivity/tools`)
3. Present to user: "I'd file this under `[resources]/[suggested-path]/`. OK?"
4. Use confirmed path for file creation.

**Create the summary note** at `[resources]/[subfolder]/[Article Title].md`:

```markdown
---
tags: [summary, topic-tag]
created: YYYY-MM-DD
source: /summarize
url: [URL]
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

## Step 7: Suggest Links and Clean Up Bookmark

**Suggest links:** Scan `[resources]/**/*.md` for notes related to the article's topic.

> Summary saved to `[resources]/[subfolder]/[Title].md`.
>
> This looks related to:
> - [[Related Note 1]] — [why]
> - [[Related Note 2]] — [why]
>
> Want me to add links?

**Clean up bookmark:** If the URL was found in `Bookmarks.md` in Step 2, ask:

> This URL was in your Bookmarks.md. Now that you have a full summary note, want me to remove it from there?

If the user confirms, remove the bookmark entry from `Bookmarks.md` and refresh `updated` in its frontmatter.
