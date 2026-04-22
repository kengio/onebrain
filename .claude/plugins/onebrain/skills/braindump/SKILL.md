---
name: braindump
description: "Capture a stream of raw thoughts : classify them and file to inbox with action items extracted. Use when the user signals a free-form, stream-of-consciousness dump with multiple unrelated threads — 'let me dump everything on my mind'. Do NOT use for: a single titled idea (use capture), saving a URL (use bookmark), or anything structured and focused."
---

# Braindump

Capture everything on your mind right now. Don't filter : just say it.

---

## Step 1: Invite the Dump

Say:
> Go for it : what's on your mind? Dump everything. I'll sort it out.

Wait for the user to share their thoughts. Don't interrupt.

---

## Step 2: Classify the Content

Silently analyze and classify each item:

| Type | Description | Destination |
|------|-------------|-------------|
| **Task** | Something to do | Extract as task with date |
| **Idea** | Creative or speculative thought | File to inbox |
| **Note** | Fact, reference, or information | File to inbox |
| **Project** | Something needing a dedicated note | Create/update in [projects_folder]/ |
| **Question** | Open question or uncertainty | File to inbox with `?` tag |
| **Feeling/Reflection** | Personal reflection or emotion | File to inbox |

---

## Step 3: Create Inbox File

File immediately : do not ask for confirmation first.

Create `[inbox_folder]/YYYY-MM-DD-braindump.md`. If a file with that name already exists: glob `[inbox_folder]/YYYY-MM-DD-braindump*.md`, count matches N, use suffix `-NN` (zero-padded to 2 digits, e.g. `-02`, `-03`):

```markdown
---
tags: [inbox, braindump]
created: YYYY-MM-DD
---

# Braindump : [Month DD, YYYY]

## Raw Thoughts

[Full text of what the user shared, lightly formatted]

## Ideas

- [idea 1]

## Notes & References

- [note 1]

## Open Questions

- [question]?

## Related Notes

[[Link to relevant existing notes if any]]
(Omit this section if no related notes are found)
```

Find related notes via qmd if available; fallback: Glob `[projects_folder]/**/*.md`, `[areas_folder]/**/*.md`, `[knowledge_folder]/**/*.md`, `[resources_folder]/**/*.md`. Omit `## Related Notes` if nothing relevant found.

---

## Step 4: Check for Project Links

If any item is a direct update, task, or decision for an active project in MEMORY.md (not a passing mention), append a brief note to that project file automatically. Mention it in the confirmation.

---

## Step 5: Extract Tasks (background)

After writing, dispatch the **Task Extractor** agent (`agents/task-extractor.md`) as a background sub-agent (`run_in_background: true`, `mode: "bypassPermissions"`), passing `note_path`, `note_content`, `vault_root`, `projects_folder`, `inbox_folder`, and `today` (today's date as YYYY-MM-DD). Proceed to Confirm immediately.

---

## Known Gotchas

- **Multiple braindumps on the same day.** The default filename `YYYY-MM-DD-braindump.md` collides if run twice on the same day. Step 3 already handles this with `-NN` suffix — do not skip the glob check even on the first call of the day.

- **Project link threshold.** Step 4 appends to project files for "direct updates" — not passing mentions. A braindump that says "thinking about starting project X" should NOT trigger an automatic append to project notes. Only clear task assignments, decisions, or status updates qualify.

---

## Step 6: Confirm

Say in one line:
💭 Filed to `[inbox_folder]/YYYY-MM-DD-braindump.md`. [If project link: Added note to "Project Name".]
