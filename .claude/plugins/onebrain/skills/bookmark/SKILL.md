---
name: bookmark
description: Quick URL bookmark capture — paste a link, AI generates name and description, suggests category, saves to Bookmarks.md in awesome-list format. Invoke when user wants to save a link, bookmark a URL, or add to their reading list.
---

# Bookmark

Save a URL to your `Bookmarks.md` file in one step. Paste the link — the AI fills in the name and description, suggests a category, and appends it to your curated list.

Usage: `/bookmark [url]`

---

## Step 1: Get the URL

If a URL was provided after the command, use it directly.

If not, ask:
> What URL do you want to bookmark?

---

## Step 2: Fetch the Page

**Resolve the resources folder first:** read `vault.yml` for `folders.resources`, defaulting to `04-resources`. Store as `[resources]` — used throughout the remaining steps.

Fetch the page content. Extract:

- **Name**: page title or product name (prefer `<title>` or `<h1>`)
- **Description**: 1-line summary (~15 words) from meta description or page body

**If fetch fails**, ask:
> I couldn't fetch that URL. What should I call it, how would you describe it in one line, and what category fits best?

Use the user's answers for all three fields and continue to Step 3 normally.

---

## Step 3: Pre-Save Checks

**Check for duplicate bookmark:** Grep `[resources]/Bookmarks.md` for the URL (using the `[resources]` path resolved in Step 2). If already present, tell the user:
> This URL is already in your Bookmarks.md under `## [Category]`. Want to save it again, or skip?

Stop if they say skip.

**Check for existing summarize note:** Grep `[resources]/**/*.md` for `url: [URL]` in frontmatter. If a matching note is found, record its title — it will be added as a wikilink in the bookmark entry (Step 5).

---

## Step 4: Suggest Category and Subcategory

Bookmarks.md supports **2 levels maximum**, like a real awesome list:

- **Level 1 — Category (`##`)**: broad domain, e.g., `AI Tools`, `Design`, `Dev Utilities`
- **Level 2 — Subcategory (`###`)**: optional refinement within a category, e.g., `Writing`, `Code`, `Productivity`

Infer the best fit from the name, description, and URL domain. Suggest a subcategory only when it adds meaningful grouping — skip it for simple or uncrowded categories.

Common top-level categories: `AI Tools`, `Dev Utilities`, `Design`, `Productivity`, `Reading`, `Learning`, `Finance`, `Health`, `Reference`

New categories and subcategories can be created freely.

---

## Step 5: Confirm and Save

Build the entry line. If a summarize note was found in Step 3, append a wikilink:

```markdown
- **[Name](URL)** — Description. → [[Summary Note Title]]
```

Otherwise:

```markdown
- **[Name](URL)** — Description.
```

Show a preview. Include subcategory only if one was suggested:

**With subcategory:**
> Saving to **Bookmarks.md** under `## AI Tools` / `### Writing`:
> `- **[Name](URL)** — Description. → [[Summary Note Title]]`
> OK? (or type a different category or category/subcategory)

**Without subcategory:**
> Saving to **Bookmarks.md** under `## Design`:
> `- **[Name](URL)** — Description.`
> OK? (or type a different category)

Save immediately on confirmation. Accept overrides in any form: `Design`, `Design / Icons`, `AI Tools > Code`.

---

## Step 6: Append to Bookmarks.md

File path: `[resources]/Bookmarks.md` (resolved in Step 2).

**If the file does not exist**, create it:

```markdown
---
tags: [bookmarks, resources]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Bookmarks
```

**Append the entry** under the correct section. Rules:

- `##` headers = top-level categories (Level 1)
- `###` headers = subcategories (Level 2, optional) — nested under their parent `##`
- Maximum depth is 2 levels — no `####` or deeper
- `##` sections are kept in alphabetical order; `###` sections within a `##` are also alphabetical
- Entries within a section are in append order
- Create missing `##` or `###` sections in alphabetical position as needed
- Refresh `updated` in frontmatter on every write

**Example structure:**

```markdown
## AI Tools

### Code

- **[GitHub Copilot](https://github.com/features/copilot)** — AI pair programmer that suggests code completions inline.

### Writing

- **[Notion AI](https://notion.so)** — AI writing assistant built into Notion pages. → [[Notion AI Summary]]

## Design

- **[Figma](https://figma.com)** — Collaborative interface design tool for teams.
```

Confirm after saving:
> Saved to **Bookmarks.md** under `## [Category]` / `### [Subcategory]` (omit subcategory line if none).

---

## Recategorize

If the user asks to move or recategorize a bookmark (e.g., *"move Raycast to Productivity"*, *"recategorize my last bookmark"*):

Resolve file path as in Step 2 (read `vault.yml` for `folders.resources`, default `04-resources`).

1. Find the entry by name, or use the last bullet line in the file for "last bookmark"
2. Remove from current section; append to bottom of target section (create `##` or `###` as needed)
3. Refresh `updated` in frontmatter
4. Confirm:
   > Moved **[Name]** from `## [Old]` → `## [New Category]` / `### [New Subcategory]` (omit subcategory if none).

> **Note:** "last bookmark" = last bullet line in the file. This heuristic may be unreliable if the file is edited manually.
