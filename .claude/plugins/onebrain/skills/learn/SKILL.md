---
name: learn
description: Teach the AI something and save it to the agent folder for future recall — context about your world or behavioral patterns
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

If vault.yml exists, read it and extract `folders.agent`. Default to `05-agent` if the file does not exist or the key is absent.
Set `agent_folder` for all paths below.

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

**Tiebreaker for domain-preference hybrids:** If the input is a preference about how to work within a domain (e.g., "always use Go idioms, not Java-style abstractions" or "keep SQL queries readable, not optimized"), classify it as **`memory/`** — it governs AI behavior, even though it references a technical domain. When in doubt: if you would change how you respond based on this input, it's `memory/`.

If classification is unclear, ask: "Is this about your world (context) or how you want me to behave (preference)?"

---

## Step 4: Determine File Name

**For `context/` notes:**
- File name: `Topic Name.md` (Title Case, by topic)
- Check if a relevant context note already exists in `[agent_folder]/context/`. If so, offer to append to it rather than create a new file.

**For `memory/` notes:**
- File name: `YYYY-MM-DD-slug.md` where slug is a short kebab-case description (first note of the day)
- If a memory note already exists today (check `[agent_folder]/memory/YYYY-MM-DD-*.md`), use a counter: `YYYY-MM-DD-02-slug.md`, `YYYY-MM-DD-03-slug.md`, etc.
- Example (first note of day): `2026-03-23-prefers-async-comms.md`
- Example (second note of day): `2026-03-23-02-no-long-responses.md`

---

## Step 5: Write the Note

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

---

## Step 6: Confirm

Report what was saved:
> Learned: "[short summary]"
> Saved to: `[agent_folder]/[context or memory]/[filename]`
>
> I'll use this in future sessions when relevant.

If a context note was appended rather than created:
> Updated: `[agent_folder]/context/[filename]` with new information.
