---
name: summarize
description: "Fetch a URL and create a structured summary note saved to the resources folder. Invoke when user wants to deeply process a link, article, blog post, documentation, or paper into a permanent vault note."
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

Grep `[resources_folder]/Bookmarks.md` for the URL. If found, note it silently : you will offer to remove it after the summary note is saved (Step 7).

---

## Step 3: Ask for Context

Optional but helpful : ask:
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

1. Glob existing subfolders in `[resources_folder]/*/`
2. Suggest a kebab-case subfolder based on the article's topic (max 2 levels, e.g. `productivity/tools`)
3. Present to user: "I'd file this under `[resources_folder]/[suggested-path]/`. OK?"
4. Use confirmed path for file creation.

**Create the summary note** at `[resources_folder]/[subfolder]/[Article Title].md`:

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
> : [Author/Source]

## My Takeaways

[Leave blank for the user to fill in, or ask if they want to add any now]

## Related

[[Link to related vault notes]]
```

---

## Step 7: Suggest Links and Clean Up Bookmark

**Suggest links:** Search for related vault notes (use qmd if available, otherwise Glob `[resources_folder]/**/*.md` and `[knowledge_folder]/**/*.md`).

──────────────────────────────────────────────────────────────
📄 Summary — {Title}
──────────────────────────────────────────────────────────────
Saved to `[resources_folder]/[subfolder]/[Title].md`

Related:
  • "{Note 1}" — {reason}
  • "{Note 2}" — {reason}
(omit "Related" block if no related notes found)

→ Add links? (say yes to link them)
→ Run /learn to save key insights to memory.

**Update bookmark with wikilink:** If the URL was found in `Bookmarks.md` in Step 2, append a wikilink to the existing bookmark entry so it points to the new summary note:

Find the line in `Bookmarks.md` containing the URL and append ` → [[Article Title]]` to it:

```markdown
- **[Name](URL)** : Description. → [[Article Title]]
```

Refresh `updated` in the Bookmarks.md frontmatter. Do this silently : no confirmation needed.

**Clean up bookmark:** After adding the wikilink, show:

🔖 Linked `Bookmarks.md` → [[{Title}]].

Then AskUserQuestion:
- question: "Remove the bookmark entry now that you have a full summary note?"
- header: "Bookmark Cleanup"
- multiSelect: false
- options:
  - label: "Remove", description: "Delete the bookmark entry — you have a full summary note now"
  - label: "Keep both", description: "Keep the bookmark and the summary note"

If the user selects "Remove", remove the bookmark entry from `Bookmarks.md` and refresh `updated` in its frontmatter.
