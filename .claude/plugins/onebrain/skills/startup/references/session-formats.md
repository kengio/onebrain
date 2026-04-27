---
name: session-formats
description: "Canonical templates for checkpoint files and session log files. Referenced by INSTRUCTIONS.md, wrapup/SKILL.md, and startup/AUTO-SUMMARY.md. All variants share the same body sections."
---

# Session File Formats

Shared canonical templates. Referenced by:
- `INSTRUCTIONS.md` — stop checkpoint writes + postcompact auto-wrapup (Path A and Path B)
- `skills/wrapup/SKILL.md` — /wrapup session log (Step 4) + orphan recovery (Step 1b)
- `skills/startup/AUTO-SUMMARY.md` — auto-saved session log

**Never add `recapped:` or `topics:` to any session log frontmatter** — these fields are set exclusively by /recap. Writing them here causes /recap to silently skip the log.

---

## Checkpoint Format

Written by the Stop hook. Keep under 250 words.

```yaml
---
tags: [checkpoint, session-log]
date: YYYY-MM-DD
checkpoint: NN
trigger: stop
merged: false
---
```

```markdown
## What We Worked On

[2-3 sentences describing the session focus]

## Key Decisions

- [bullet list of decisions made]

## Insights & Learnings

- [new understanding, patterns, discoveries — omit section if none]

## What Worked / Didn't Work

- ✅ [something that worked]
- ❌ [something that didn't — omit section if no notable friction]

## Action Items

- [ ] [task] 📅 YYYY-MM-DD

## Open Questions

- [unresolved questions]
```

---

## Session Log Format

### Body Sections

All session log variants share the same body structure:

```markdown
# Session Summary : [Month DD, YYYY] (Session N)

## What We Worked On

[1-3 sentences describing the session's focus]

## Key Decisions

- [Decision 1]

## Insights & Learnings

- [Insight 1]

## What Worked / Didn't Work

- ✅ [Something that worked]
- ❌ [Something that didn't]

_Omit this section if no notable friction or technique worth logging._

## Action Items

- [ ] [task] 📅 YYYY-MM-DD

## Open Questions

- [Question or uncertainty to revisit]
```

### Frontmatter Variants

All session logs start with these base fields:

```yaml
---
tags: [session-log]
date: YYYY-MM-DD
session: NN
```

Add variant-specific fields before closing `---`:

| Variant | Additional fields |
|---------|------------------|
| Standard `/wrapup` | _(none)_ |
| Auto-saved (auto-summary, no checkpoints) | `auto-saved: true` |
| Auto-saved with checkpoints incorporated | `auto-saved: true` + `synthesized_from_checkpoints: true` |
| Orphan recovery (`/wrapup` Step 1b) | `synthesized_from_checkpoints: true` + `auto-recovered: true` |
| PostCompact Path A (checkpoint files found) | `synthesized_from_checkpoints: true` + `auto-recovered: true` |
| PostCompact Path B (no checkpoint files) | `auto-compact: true` |
