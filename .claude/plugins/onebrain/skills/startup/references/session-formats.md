---
name: session-formats
description: "Canonical templates for checkpoint files and session log files. Referenced by INSTRUCTIONS.md, wrapup/SKILL.md, and startup/AUTO-SUMMARY.md. All variants share the same body sections."
---

# Session File Formats

Shared canonical templates. Referenced by:
- `INSTRUCTIONS.md` — stop checkpoint writes
- `skills/wrapup/SKILL.md` — /wrapup session log (Step 4) + orphan recovery (Step 1b)
- `skills/startup/AUTO-SUMMARY.md` — auto-saved session log

**Never add `recapped:` or `topics:` to any session log frontmatter** — these fields are set exclusively by /recap. Writing them here causes /recap to silently skip the log.

---

## Shared Body Sections

Both checkpoint files and session log files use these sections in order:

```markdown
## What We Worked On

[see per-format note below]

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

## Checkpoint Format

Written by the Stop hook. Keep under 250 words total.

**Frontmatter:**
```yaml
---
tags: [checkpoint, session-log]
date: YYYY-MM-DD
checkpoint: NN
trigger: stop
---
```

**Body:** use Shared Body Sections above. `## What We Worked On`: 2-3 sentences describing the session focus.

**Dataview compatibility:** Never write `` `=… `` (backtick followed by `=`) anywhere in the file — Dataview parses it as an inline query and throws a parse error in Obsidian. Use `→` in place of `==>`, or describe the concept in plain prose instead of quoting it in a code span.

---

## Session Log Format

**Header line** (before body sections):
```markdown
# Session Summary : [Month DD, YYYY] (Session N)
```

**Body:** use Shared Body Sections above. `## What We Worked On`: 1-3 sentences describing the session's focus.

### Frontmatter by Case

Use the complete block for the matching case. Do not mix fields from different cases.

**Standard /wrapup — no checkpoints incorporated:**
```yaml
---
tags: [session-log]
date: YYYY-MM-DD
session: NN
---
```

**Standard /wrapup — checkpoints incorporated:**
```yaml
---
tags: [session-log]
date: YYYY-MM-DD
session: NN
synthesized_from_checkpoints: true
---
```

**Auto-saved (auto-summary) — no checkpoints:**
```yaml
---
tags: [session-log]
date: YYYY-MM-DD
session: NN
auto-saved: true
---
```

**Auto-saved (auto-summary) — checkpoints incorporated:**
```yaml
---
tags: [session-log]
date: YYYY-MM-DD
session: NN
auto-saved: true
synthesized_from_checkpoints: true
---
```

**Recovered from checkpoints** (used by: /wrapup orphan recovery for prior sessions whose checkpoints were never wrapped up):
```yaml
---
tags: [session-log]
date: YYYY-MM-DD
session: NN
synthesized_from_checkpoints: true
auto-recovered: true
---
```

**Body marker (required for this case):** the very first body line — placed before `# Session Summary :` — must be the recovery-of marker:
```markdown
<!-- recovery-of: {token}:{YYYY-MM-DD} -->
```

Where `{token}` is the recovered group's session token (parsed from the checkpoint filenames) and `{YYYY-MM-DD}` is the recovered session's date (the checkpoint files' date prefix, not today). Emit one marker line per recovered group; if a single recovery pass aggregates multiple groups, write one marker per group on consecutive lines.

**Why a body marker, not just frontmatter:** /wrapup's `already-recovered` short-circuit (Step 1b → Auto-Recover step a) needs a stable, version-independent signal that a given group was already preserved in a prior recovered log. Frontmatter shape has drifted across releases (`auto-recovered: true` here, `case: recovered` in older drafts, `synthesized_from_checkpoints: true` shared with manual wrapups). The body marker is the only signal that:
1. Names the specific token + date pair recovered (frontmatter doesn't), so multi-group recovery logs short-circuit per group rather than as a whole,
2. Survives any future frontmatter-key rename without breaking existing recovered logs,
3. Is greppable by a fast `rg`/`grep` before any YAML parse.

Recovered logs written by older /wrapup versions (predating this marker) won't match the short-circuit and will be re-recovered into a duplicate session log; this is acceptable — the duplicate is harmless and the user can dedupe manually if desired.
