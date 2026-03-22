# Community Plugins Curation — Design Spec

**Date:** 2026-03-22
**Status:** Approved

---

## Problem

OneBrain ships with 7 community plugins preinstalled:

- `obsidian-tasks-plugin`
- `dataview`
- `templater-obsidian`
- `calendar`
- `tag-wrangler`
- `quickadd`
- `terminal`

None of the OneBrain Claude skills depend on any community plugin — all skill workflows are Claude-driven (Grep, Read, Write tools). The plugins exist solely for the Obsidian UI experience. Without an explicit rationale for each plugin, the list had grown to include plugins that overlap with Claude's own skills, add setup overhead, and create confusion for new users.

---

## Goals

- Every installed plugin must have a clear, named reason to exist
- Remove plugins that overlap with Claude skill functionality
- Remove plugins with no near-term value for the OneBrain workflow
- Keep the install footprint small

---

## Primary Use Pattern

Users interact with OneBrain in a mixed mode:

- **Claude Code** for AI-driven work (`/braindump`, `/tasks`, `/capture`, etc.)
- **Obsidian directly** for browsing notes, clicking tasks, building dashboards, and navigating the vault
- The `terminal` plugin enables running `claude` from within Obsidian — the vault is the working environment


---

## Approved Plugin List (3 plugins)

### 1. `obsidian-tasks-plugin` — Mandatory

The task format used across all OneBrain skills and CLAUDE.md was intentionally designed to match Obsidian Tasks conventions:

```markdown
- [ ] Task description 📅 YYYY-MM-DD 🔺
```

The emoji markers (`📅`, `🔺`, `⏫`, `🔽`) are Obsidian Tasks syntax. This plugin renders tasks richly in Obsidian (due date badges, priority colors, task queries). Removing it would break the Obsidian-side task experience.

**Verdict: Mandatory. The system is built around it.**

### 2. `terminal` — Mandatory

Embeds a terminal emulator inside Obsidian. Users run `claude` (or `gemini`) directly from the vault directory without switching applications. This makes Obsidian the complete working environment.

**Verdict: Mandatory. Core to the Claude-inside-Obsidian UX.**

### 3. `dataview` — Recommended

Provides a SQL-like query engine for notes. Users can write inline queries to build dynamic dashboards, e.g.:

```dataview
TABLE file.mtime, tags FROM "01-projects" WHERE contains(tags, "active")
```

Claude's `/tasks` skill handles task scanning, but Dataview covers broader note queries that Claude doesn't expose as a standing view. It fills a genuine gap: standing views like "all notes tagged #active" or "files modified this week" that persist inside the vault without requiring Claude to be running.

**Verdict: Keep. Complements Claude skills rather than duplicating them.**

---

## Removed Plugins

### `quickadd` — Removed

QuickAdd provides hotkey-triggered capture and macro automation inside Obsidian. This overlaps directly with Claude's `/capture` and `/braindump` skills, which also capture notes but add intelligence: wikilink suggestions, content classification, and routing to the correct vault folder.

Having two capture paths (QuickAdd and Claude) creates confusion about where notes end up and which tool to use. Claude's approach is strictly better for the OneBrain workflow.

### `templater-obsidian` — Removed

Templater provides advanced note templating inside Obsidian. OneBrain's Claude skills create all notes directly using structured formats defined in the skill files. There is no Obsidian-side template workflow to support.

### `tag-wrangler` — Removed

Tag Wrangler allows bulk renaming and merging of tags across the vault. Useful long-term but provides no value on a fresh vault. Users can install it manually if their tag taxonomy grows unwieldy.

### `calendar` — Removed

The Calendar plugin adds a sidebar widget for navigating daily notes. OneBrain does not use daily notes as a core concept — session summaries are stored as `YYYY-MM-DD-session-NN.md` files, not daily notes. Calendar has nothing meaningful to show.

---

## Scope

This change applies to **new installs only**. The `install.sh` script reads `community-plugins.json` and downloads whatever is listed — updating the JSON is the complete implementation. Existing vault users who already have OneBrain installed will retain their current plugins untouched; they can uninstall removed plugins manually via Settings → Community plugins if desired.

There is no `enabled-plugins.json` in `.obsidian/` — Obsidian uses `community-plugins.json` as the single source of truth for installed plugins. No other files need updating.

---

## Implementation

**Files to change:**

1. `.obsidian/community-plugins.json` — update to the 3-plugin list
2. No changes to `install.sh` — it reads `community-plugins.json` and installs whatever is listed

**No skill changes required.** No Claude skill references any community plugin.

---

## Future Considerations

- If a daily journaling workflow is added, `calendar` becomes relevant again
- `tag-wrangler` can be recommended in documentation as an optional install for mature vaults
- Plugin list is the single source of truth — `install.sh` reads it automatically
