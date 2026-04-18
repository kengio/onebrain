---
name: bookmark
description: "Quick URL bookmark capture : paste a link, AI generates name and description, suggests category, saves to Bookmarks.md in awesome-list format. Invoke when user wants to save a link, bookmark a URL, or add to their reading list."
---

# Bookmark

Save a URL to your `Bookmarks.md` file in one step. Paste the link : the AI fills in the name and description, picks a category, and saves immediately.

Usage: `/bookmark [url]`

---

## Step 1: Get the URL

If a URL was provided after the command, use it directly.

If not, ask:
> What URL do you want to bookmark?

---

## Step 2: Fetch the Page

Fetch the page content. Extract:

- **Name**: page title or product name (prefer `<title>` or `<h1>`)
- **Description**: 1-line summary (~15 words) from meta description or page body

**If fetch fails**, ask:
> I couldn't fetch that URL. What should I call it, how would you describe it in one line, and what category fits best?

Use the user's answers and continue normally.

---

## Step 3: Pre-Save Checks

**Duplicate check:** grep `[resources_folder]/Bookmarks.md` for the URL (`[resources_folder]` from Step 2). If already present, tell the user and stop (unless they confirm to save again).

**Existing summary note:** grep `[resources_folder]/**/*.md` for `url: [URL]` in frontmatter. If found, record its title for use as a wikilink in the entry.

---

## Step 4: Pick Category

Infer the best category and optional subcategory from the content : do not ask. Use the structure:

- **Level 1 (`##`)**: broad domain : `AI Tools`, `Design`, `Dev Utilities`, `Productivity`, `Reading`, `Learning`, `Finance`, `Health`, `Reference`
- **Level 2 (`###`)**: optional refinement : only when it adds meaningful grouping

Create new categories freely when none fit.

---

## Step 5: Save to Bookmarks.md

Build the entry:

```markdown
- **[Name](URL)** : Description. → [[Summary Note Title]]
```

(Omit the wikilink if no summary note was found in Step 3.)

File path: `[resources_folder]/Bookmarks.md` (`[resources_folder]` from Step 2).

**If the file does not exist**, create it:

```markdown
---
tags: [bookmarks, resources]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Bookmarks
```

Append under the correct `##` / `###` section (alphabetical order). Create missing sections in alphabetical position. Refresh `updated` in frontmatter.

---

## Step 6: Confirm

Say in one line:
🔖 Saved to `Bookmarks.md` under {Category}. [If subcategory: / {Subcategory}]

---

## Recategorize

If the user asks to move or recategorize a bookmark:

1. Resolve file path using `[resources_folder]`
2. Find the entry by name, or use the last bullet for "last bookmark"
3. Remove from current section; append to target section (create `##` / `###` as needed)
4. Refresh `updated` in frontmatter
5. Confirm in one line:
   🔖 Moved {Name} from {Old} → {New}. [If subcategory: / {Sub}]
