# Note Template — Reference

All handlers use this base template. Type-specific sections are added by each handler.

**If file came from an explicit path (not inbox) : file is kept in place:**

```markdown
---
tags: [import, <type-tag>]
created: YYYY-MM-DD
source: /import
file_type: <pdf|docx|xlsx|pptx|image|svg|video|script>
file_path: /absolute/path/to/original
---

# [Filename or derived title]

> **Original file:** [Open](file:///absolute/path/to/original)
> **Imported:** YYYY-MM-DD

[If --attach flag was used and file type supports it, add: ![[filename]] ]

## Summary

[2-3 sentence distillation, AI description, or plain-language explanation]

## Key Points / Contents

[Extracted structure : key sections, data highlights, slide outline, script analysis, etc.]

## Related

[[linked vault notes]]
```

**If file came from the inbox : file is deleted after import:**

```markdown
---
tags: [import, <type-tag>]
created: YYYY-MM-DD
source: /import
file_type: <pdf|docx|xlsx|pptx|image|svg|video|script>
---

# [Filename or derived title]

> **Imported from inbox:** YYYY-MM-DD : staging copy removed after import

[If --attach flag was used and file type supports it, add: ![[filename]] ]

## Summary

[2-3 sentence distillation, AI description, or plain-language explanation]

## Key Points / Contents

[Extracted structure : key sections, data highlights, slide outline, script analysis, etc.]

## Related

[[linked vault notes]]
```

**Type-specific section additions (after Key Points):**
- **Scripts**: `## Code` : full file content in a fenced code block
- **PowerPoint**: `## Slide Outline` : slide titles as headings + key points per slide
- **Excel (full extraction)**: replaces `## Key Points / Contents` : use `## Summary` (AI-generated) + `## [Sheet Name]` (markdown table per sheet)
- **Excel (stub)**: `## Summary` : left blank for manual entry

**Scan for related notes:** After creating the note, grep `[resources_folder]/**/*.md` and `[knowledge_folder]/**/*.md` for titles or tags related to the file's topic. Suggest up to 2 wikilinks if found. If no related notes are found, leave the `## Related` section with: `_No related notes found : add links manually._`

> **Note on `file_path`:** `file_path` is only included for files imported from an explicit path (kept in place after import). For inbox-staged files, `file_path` is omitted : the staging copy is deleted and the note is the permanent artifact.
