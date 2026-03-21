---
name: OneBrain Session Start
event: SessionStart
description: Load identity from MEMORY.md, check inbox and recent sessions, greet user
---

# Session Start — OneBrain

At the start of every session, perform these steps in order:

## Step 1: Load Identity

Read `MEMORY.md` from the vault root. This file contains:
- The user's name and preferred name
- Their role and communication style
- Their goals and values
- AI personality instructions to follow for this session
- Active projects and key learnings

Apply the "AI Personality Instructions" section immediately — it defines how to address and interact with the user.

## Step 2: Check Inbox

If `vault.yml` exists, read it to determine the inbox folder name (`folders.inbox`); otherwise default to `00-inbox`.

List all files in the inbox folder (excluding .gitkeep).

Count:
- Files present = items waiting to be processed

## Step 3: Check Recent Memory

If `vault.yml` exists, read it to determine the memory log folder name (`folders.memory_log`); otherwise default to `04-memory-log`.

List files in the memory log folder sorted by name (descending). Read the most recent one.

Note:
- Date of last session
- What it was about (the summary)
- Any open action items from that session

## Step 4: Greet the User

Compose a brief greeting (3-5 lines max) that includes:

1. Address the user by their preferred name from MEMORY.md
2. Report inbox status: "You have N items in your inbox" (or "Your inbox is clear")
3. If last session found: "Last session ([date]) was about [topic]" + any open items
4. One short suggested action based on context (e.g., "Want to run /consolidate to process your inbox?" or "Shall we continue working on [project]?")

Keep the greeting concise. Don't be verbose. Match the user's communication style from MEMORY.md.

## Example Greeting

> Hey [Name]! You have 3 items in your inbox from this week.
> Last session (2026-03-18) you were working on the API redesign — there was one open action: finalize the schema draft.
> Want to start there, or run /consolidate to clear the inbox first?

---

*If MEMORY.md doesn't exist or hasn't been filled in yet, skip steps 2-4 and greet the user generically, then suggest running `/onboarding` to set up their vault.*
