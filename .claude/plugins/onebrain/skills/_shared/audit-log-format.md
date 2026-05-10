---
name: audit-log-format
description: "Canonical audit-log frontmatter, append-per-day algorithm, run-section heading, and failure mode. Referenced by every skill that writes an entry under [logs_folder]/log/."
---

# Audit Log Format

Shared canonical format for skill-run audit logs. Every skill that writes to `[logs_folder]/log/YYYY/MM/` follows this format. The unique per-skill body sections (e.g. `### Memory Changes` for /recap, slug rules for /distill) live in each skill's own SKILL.md; everything common lives here.

Referenced by: `recap/`, `distill/`, `learn/`, `memory-review/`, `consolidate/`, `connect/`, `reorganize/`, `onboarding/`, `qmd/`, `clone/`, `doctor/`, `update/`, `weekly/`.

---

## Canonical Frontmatter

Every audit-log file begins with this frontmatter. Three required fields, in this order:

```yaml
---
tags: [audit-log, <skill>]
skill: /<skill>
date: YYYY-MM-DD
---
```

**Field rules:**

- **`tags`** — always a list with `audit-log` first (umbrella) and the skill name second (specific). The umbrella `audit-log` tag lets users query all audit logs in one Dataview block; the second tag narrows by skill.
- **`skill`** — the slash-command form (`/recap`, `/distill`, `/qmd`, …). Always present, even when the skill name appears in `tags`. Files shared across two skills (e.g. `memory.md` written by both `/learn` and `/memory-review`) use a YAML list: `skill: [/learn, /memory-review]`.
- **`date`** — the file's date in ISO format. Replaces the older `created:` and `updated:` fields used inconsistently across skills. One file per (skill, day), so `date` matches the date in the filename.

**Per-skill discriminators** (added below the canonical 3 when the skill needs them):

| Skill | Extra frontmatter | Reason |
|---|---|---|
| `/distill` | `topic: "<verbatim>"`, `slug: "<slug>"` | one file per (topic, day) — discriminator is in filename and frontmatter |
| `/qmd` | `subcommand: setup\|embed\|reindex\|uninstall`, `collection: <name>` | one file per (subcommand, day) |
| `/clone` | `method: folder-copy \| display-paths`, `include_archive: true \| false` | run shape |
| `/onboarding` | `path: A \| B`, `plugin_version: X.Y.Z`, `run: N` | install path + version snapshot |
| `/reorganize` | `mode: full \| subfolder \| both` | which migration ran |
| `/doctor` | `flags: [--vault, --config, --fix]` | which flags were active |
| `/update` | `channel: stable\|next\|N.x`, `from_version: X.X.X`, `to_version: X.X.X` | update path |
| `/weekly` | `week_start: YYYY-MM-DD`, `week_end: YYYY-MM-DD`, `sessions_reviewed: N`, `intentions_set: N` | weekly metadata |

---

## Append-Per-Day Algorithm

All audit-log files are append-per-day. Algorithm:

1. Compute `target_path = [logs_folder]/log/YYYY/MM/YYYY-MM-DD-<name>.md` where `<name>` is the per-skill filename (e.g. `recap`, `distill-{slug}`, `qmd-setup`, `memory`).
2. Create parent dir `[logs_folder]/log/YYYY/MM/` if missing.
3. **If the target file already exists:** append a new `## Run HH:MM` section to the bottom — do NOT duplicate the frontmatter or `# <Skill> — YYYY-MM-DD` heading. Each run produces one new section.
4. **If the target file does not exist:** create it with the frontmatter block above, the `# <Skill> — YYYY-MM-DD` heading, then the first `## Run HH:MM` section.

`HH:MM` is the local time at run start in 24-hour format (e.g. `14:32`).

---

## Canonical Run-Section Heading

Every run inside an audit-log file is fenced by:

```markdown
## Run HH:MM
```

No parens, no metadata in the heading. Run metadata (scope, file count, duration, etc.) goes into the **first bullet** under the heading:

```markdown
## Run HH:MM

- Scope: knowledge-base
- Files touched: 12
- Duration: 4.3s

### <Section Title>
- …
```

**Exception — shared file (`memory.md`):** `/learn` and `/memory-review` both write to the same daily file, so they distinguish their sections by appending the skill name to the heading: `## Run HH:MM /learn` and `## Run HH:MM /memory-review`. This is the only file where the run heading carries a discriminator. All other audit logs use the bare `## Run HH:MM` form.

---

## Body Convention

After the run heading and metadata bullet(s), the run body uses `### <Section>` subheadings for the per-skill content (e.g. `### Memory Changes`, `### Files moved`, `### Wikilinks added`). Section names are defined per skill — see each skill's "Write Log Entry" template.

---

## Failure Mode

Audit-log writes are **supplementary, not blocking**. If the write fails (permission error, full disk, mid-run interrupt):

1. Report the failure to the user in **one** line. Do not retry, do not raise, do not abort the parent skill.
2. Continue with the rest of the skill flow as if the log entry had been written.

The user-facing output and the actual vault changes are the primary deliverables; the audit log is an after-the-fact record that should never get in the way of the work itself.

---

## Empty / No-op Runs

Some skills run but have nothing to log (e.g. `/consolidate` against an empty inbox, `/connect` finding no new wikilinks, `/reorganize` on an already-organized vault). In those cases **skip writing entirely** — there is nothing to record. Each skill defines its own no-op condition; check the skill's "Write Log Entry" section.

---

## Filename Conventions

| Skill | Filename pattern | Notes |
|---|---|---|
| `/recap` | `YYYY-MM-DD-recap.md` | one per day |
| `/distill` | `YYYY-MM-DD-distill-{slug}.md` | one per (topic, day) |
| `/learn`, `/memory-review` | `YYYY-MM-DD-memory.md` | shared file |
| `/consolidate` | `YYYY-MM-DD-consolidate.md` | one per day |
| `/connect` | `YYYY-MM-DD-connect.md` | one per day |
| `/reorganize` | `YYYY-MM-DD-reorganize.md` | one per day |
| `/onboarding` | `YYYY-MM-DD-onboarding.md` | one-shot per vault lifetime |
| `/qmd <sub>` | `YYYY-MM-DD-qmd-<sub>.md` | one per (subcommand, day) |
| `/clone` | `YYYY-MM-DD-clone.md` | one per day |
| `/doctor` | `YYYY-MM-DD-doctor.md` | one per day |
| `/update` | `YYYY-MM-DD-update-vX.X.X.md` | per update run; lives in `[logs_folder]/update/` (NOT `[logs_folder]/log/`) post-v2.4.0 |
| `/weekly` | `YYYY-MM-DD-weekly.md` | one per week |

> `/update` is the one outlier: its log lives under `[logs_folder]/update/` (flat, post-v2.4.0), not under `[logs_folder]/log/`. The frontmatter and append rules still apply.
