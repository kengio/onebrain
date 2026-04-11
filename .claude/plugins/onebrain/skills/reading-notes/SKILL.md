---
name: reading-notes
description: Process a book or article into structured progressive summary notes saved to the resources folder
---

# Reading Notes

Turn a book or article into structured, permanent notes using the progressive summarization method, saved to your resources folder.

Usage: `/reading-notes [title]` or `/reading-notes` then follow prompts.

---

## Step 1: Get the Book/Article Info

Ask:
> What are you taking notes on?
> - Title:
> - Author:
> - Type: book / article / paper / other

Then ask:
> Are you:
> a) Sharing notes/highlights you've already taken : I'll organize them
> b) Describing the book from memory : I'll structure what you share
> c) Pasting raw text or quotes : I'll extract and synthesize

---

## Step 2: Gather Content

Based on their answer:
- **a)**: Ask them to paste their notes/highlights
- **b)**: Ask open questions: "What were the main ideas? What did you take away? Any memorable quotes?"
- **c)**: Ask them to paste the text

Take what they give, however messy.

---

## Step 3: Synthesize

From the raw input, extract:

- **Core thesis**: What is this book/article fundamentally about?
- **Key ideas**: The 3-7 most important concepts
- **Supporting evidence or examples**: What supports each idea?
- **Memorable quotes**: Exact words worth keeping
- **Surprises or challenges**: What contradicted or changed your thinking?
- **Actionable takeaways**: What can you do differently because of this?
- **Questions it raised**: What do you want to explore further?

---

## Step 4: Choose Subfolder

1. Glob existing subfolders in `04-resources/*/`
2. Suggest a kebab-case subfolder based on the book/article's topic (max 2 levels, e.g. `books/productivity` or `science/neuroscience`)
3. Present to user: "I'd file this under `04-resources/[suggested-path]/`. OK?"
4. Use confirmed path for file creation.

---

## Step 5: Create the Note

File: `04-resources/[subfolder]/[Book Title] : Notes.md` (subfolder confirmed in Step 4)

```markdown
---
tags: [reference, topic-tag]
created: YYYY-MM-DD
source: /reading-notes
author: [Author]
type: [book/article/paper]
status: [reading/finished]
rating: [1-5 if they want to rate it]
---

# [Book Title]
*by [Author]*

## Core Thesis

[One paragraph : what is this fundamentally about?]

## Key Ideas

### [Idea 1 Title]
[Explanation in your own words]

> "[Supporting quote]"

### [Idea 2 Title]
[Explanation]

### [Idea 3 Title]
[Explanation]

## Memorable Quotes

> "[Quote 1]"
> : [Author], p. [page if known]

> "[Quote 2]"

## My Takeaways

- [What this means for my work/life]
- [What I want to try or apply]

## Questions & Further Exploration

- [Question raised by this book]
- [Related topic to research: [[Related Note]]]

## Raw Highlights

<!-- Paste original highlights here for reference -->
[Raw content if provided]

## Related

[[Related Note 1]]
[[Related Note 2]]
```

---

## Step 6: Follow Up

> Notes saved to `04-resources/[subfolder]/[Title] : Notes.md`.
>
> Want to:
> - Add this to your reading list in a project note?
> - Run `/connect` to find vault notes this connects to?
> - Set a reminder to revisit these notes? (I can add a task)
