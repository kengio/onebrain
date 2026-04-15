---
name: learn
description: Teach the AI something and save it to the agent folder for future recall : context about your world or behavioral patterns
---

# Learn

Explicitly teach the agent something to remember across all future sessions.

Usage: `/learn [content]` or `/learn` then describe what to save.

---

## Step 1: Get the Content

If content was provided after the command, use it directly.
If not, ask:
> What do you want me to learn? Share a fact, preference, domain detail, or anything you want me to remember.

---

## Step 2: Read vault.yml

If vault.yml exists, read it and extract:
- `folders.agent` → `[agent_folder]` (default: `[agent_folder]`)
- `qmd_collection` → `[qmd_collection]` (used in Step 6 to update the qmd index; if absent, qmd update is skipped)

---

## Step 3: Classify the Input

Apply this rule to determine the destination:

**→ `[agent_folder]/context/`** if the content describes the user's world:
- Domain, industry, or field knowledge
- Technical stack, tools, or systems
- Product, team, customers, or company
- Terminology, naming conventions, or abbreviations

**→ `[agent_folder]/memory/`** if the content is a behavioral preference or pattern:
- How the user wants to be communicated with
- Things that help or hinder the AI's responses
- Recurring preferences or frustrations

**Classification examples:**

| Input | Destination |
|---|---|
| "My stack is Go + Postgres + Redis" | context/ |
| "When I say 'the app' I mean my SaaS at app.example.com" | context/ |
| "My target user is small business owners, not enterprises" | context/ |
| "I prefer async communication and document decisions in notes" | memory/ |
| "I get frustrated when responses are too long" | memory/ |

**Tiebreaker for domain-preference hybrids:** If the input is a preference about how to work within a domain (e.g., "always use Go idioms, not Java-style abstractions" or "keep SQL queries readable, not optimized"), classify it as **`memory/`** : it governs AI behavior, even though it references a technical domain. When in doubt: if you would change how you respond based on this input, it's `memory/`.

If classification is unclear, ask: "Is this about your world (context) or how you want me to behave (preference)?"

---

## Step 4: Determine File Name

**For `context/` notes:**
- File name: `Topic Name.md` (Title Case, by topic)
- Check if a relevant context note already exists in `[agent_folder]/context/`. If so, offer to append to it rather than create a new file.

**For `memory/` notes:**
- File name: `YYYY-MM-DD-slug.md` where slug is a short kebab-case description (first note of the day)
- If memory notes already exist today: glob `[agent_folder]/memory/YYYY-MM-DD-*.md`, extract all numeric counters present in filenames (e.g. `02` from `2026-03-23-02-slug.md`). If any counters exist, use `max(counters) + 1`. If files exist but none have a numeric counter (only the first, un-numbered file exists), next is `02`.
- Example (first note of day): `2026-03-23-prefers-async-comms.md`
- Example (second note of day): `2026-03-23-02-no-long-responses.md`
- Example (third note of day): `2026-03-23-03-another-pref.md`

---

## Step 5: Contradiction Check

Before writing, search for potential conflicts with existing knowledge:

1. Extract 2–3 **specific** keywords or phrases from the new content. Prefer proper nouns, tool names, or multi-word phrases over generic single words. If only generic keywords are available, skip and proceed to Step 6.
2. Search `[agent_folder]/context/` and `[agent_folder]/memory/` for those keywords (use qmd if available, otherwise Grep).
3. Read any matching files
4. Determine if any existing entry **directly contradicts** the new fact — same topic, opposite claim

> **Note:** False positives are common. Only flag when entries clearly contradict each other, not merely when they cover related topics.

**If a contradiction is found**, present all conflicts in a single AskUserQuestion:
```
Found N possible conflict(s) with existing entries:
> "[existing claim excerpt 1]" — [filename1]
> "[existing claim excerpt 2]" — [filename2]  (omit if only 1 conflict)

How do you want to handle this?
1. Supersede all — mark all conflicting entries as outdated and save the new one
2. Supersede some — ask me about each conflict individually
3. Save both — keep all entries (may be valid in different contexts)
4. Cancel — don't save anything
```

- If **Supersede all** or **Supersede some**: For each conflicting file, apply the strikethrough to the specific contradicted claim. If it spans multiple lines, wrap the entire passage in a single strikethrough block: `~~[passage]~~ _(superseded YYYY-MM-DD)_`. **Do not apply strikethrough inside fenced code blocks (``` ... ``` or 4-space-indented blocks) or to lines beginning with `#` (headings).** For "Supersede some", use a separate AskUserQuestion per file: "Supersede `[filename]`? (yes / no)". Then proceed to write the new entry.
- If **Save both**: proceed to write the new entry without modifying the old one.
- If **Cancel**: stop and confirm cancellation to the user.

**If no contradiction is found**, proceed directly to Step 6 — no user interaction needed.

---

## Step 6: Write the Note

**For `context/` notes:**

```markdown
---
tags: [agent-context]
created: YYYY-MM-DD
source: /learn
---

# [Topic]

[Content as provided, lightly structured if helpful]
```

**When appending to an existing context note:** Add a new `##` section with a descriptive heading for the additional information. Do not rewrite or restructure existing content.

**For `memory/` notes:**

```markdown
---
tags: [agent-memory]
created: YYYY-MM-DD
source: /learn
---

# [Short description of pattern]

[Pattern or behavioral observation, 1-3 sentences]
```

After writing, run `qmd update -c [qmd_collection]` if qmd is available (keeps the file searchable for /recap).

---

## Step 7: Confirm

Report what was saved:
> Learned: "[short summary]"
> Saved to: `[agent_folder]/[context or memory]/[filename]`
>
> I'll use this in future sessions when relevant.

If a context note was appended rather than created:
> Updated: `[agent_folder]/context/[filename]` with new information.
