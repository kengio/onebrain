---
name: doctor
description: "Diagnose vault and plugin health — checks broken links, orphan notes, stale memory/ files, inbox backlog, and plugin config validity. Use when the user asks to check vault health, notices something broken, or wants a system audit — 'run /doctor', 'check my vault', 'something seems off'. Do NOT use for: searching vault content (search directly), processing inbox (use consolidate), or updating the system (use update)."
schedulable: true
---

# Doctor

Diagnose the health of your OneBrain vault and plugin configuration. Inspired by `brew doctor` and `npm doctor`.

Usage:
- `/doctor` — full check (vault + config + memory)
- `/doctor --vault` — vault content checks only (skips CLI doctor)
- `/doctor --config` — plugin config + CLI doctor only (skips vault content)
- `/doctor --fix` — auto-fix safe issues (CLI fix recipes + skill fixes)

**Flag detection:** Determine active flags from the user's message. `--vault` = user mentions vault-only or content health; `--config` = user mentions config or plugin check; `--fix` = user explicitly asks to fix or auto-fix. Default (no flags) = run all checks.

**Two-source architecture** (post-v3.0.0 GA):
- **CLI doctor** (`onebrain doctor --json`) handles the 8 built-in checks: vault.yml, vault.yml-keys, folders, plugin-files, settings-hooks, orphan-checkpoints, qmd-embeddings, claude-settings. Rust-native, single subprocess call, structured JSON output.
- **Skill checks** handle vault-content + state-machine checks the CLI doesn't cover: broken wikilinks, orphan notes, stale memory/ files, MEMORY.md size, inbox backlog, log folder size, scheduler health, pause-thread state, memory health.

The skill merges both into one unified report.

---

## Step 1: Read vault.yml

Read `vault.yml`. If it's missing → ⛔ `vault.yml not found — OneBrain may not be configured correctly.` Stop.

Resolve folder variables (`[inbox_folder]`, `[projects_folder]`, etc.) from vault.yml or defaults.

---

## Step 2a: Run CLI doctor (skip if `--vault` flag)

Run `onebrain doctor --json` (or `onebrain doctor --fix --json` if `--fix` is active). Parse the JSON envelope:

```json
{
  "ok": true|false,
  "summary": {"total": N, "errors": N, "warnings": N, "passing": N},
  "checks": [
    {"check": "<name>", "status": "ok|warn|error", "message": "...", "details": ["..."], "hint": "...", "fix": {...}}
  ]
}
```

Status → render emoji: `ok` → ✅, `warn` → 🟡, `error` → 🔴.

If the CLI is not installed (`onebrain` not on PATH or exit ≠ 0 with "command not found"): emit one finding — 🔴 `onebrain CLI not installed — hooks will not fire; install via brew tap onebrain-ai/onebrain && brew install onebrain (or npm install -g @onebrain-ai/cli)` — and **skip the rest of CLI doctor**. The CLI is the source of truth for the 8 core checks; without it, fall through to skill checks only.

When `--fix --json` returned `fix[]`, render each fix's outcome under the matching check ("✓ fixed", "✕ failed", or "skip"); the post-fix `checks[]` reflects state after the fix attempts.

> **Why pass `--json`:** WebFetch / shell text parsing of `onebrain doctor`'s human format is fragile. `--json` is the stable contract (frozen for v3.x — see CLI CHANGELOG).

---

## Step 2b: Run skill-only checks (skip if `--config` flag)

The CLI doctor does NOT cover the following — they remain in the skill:

**Broken wikilinks**
- Grep `[projects_folder]`, `[areas_folder]`, `[knowledge_folder]`, `[resources_folder]`, `[agent_folder]` for `\[\[.*?\]\]` in `.md` files.
- **Skip** wikilinks inside fenced code blocks (between ` ``` ` fences), blockquote lines (lines beginning with `>`), inline code spans (the entire `[[...]]` enclosed in backticks on that line), or YAML frontmatter (between the leading `---` and the closing `---`).
- For each wikilink, extract note name: strip `|display text` suffix AND `#anchor` fragment. Preserve original text for accurate replacement.
- Check if a `.md` file with that exact name exists anywhere in the vault (case-insensitive). Flag unresolved as `{broken_link, display_text, anchor, source_file, source_line}`.

**Orphan notes**
- Find notes in `[knowledge_folder]/` and `[resources_folder]/` with zero inbound wikilinks from any other note. Report only — no auto-fix (linking requires semantic judgment; use `/connect`).

**Stale memory/ files**
- If `[agent_folder]/MEMORY.md` is absent: 🟡 `MEMORY.md not found — run /onboarding` (skip this + MEMORY.md size check).
- If `memory/` folder is absent: skip.
- Read `memory/` files with `status: active` or `needs-review` (skip `deprecated`).
- Flag: `verified:` older than 90 days OR no `verified:` field OR (`conf: low` AND `verified:` absent/older than 30 days).

**MEMORY.md size**
- Count lines in `[agent_folder]/MEMORY.md`. Warn if > 180: suggest pruning Critical Behaviors.

**Inbox backlog**
- Count `[inbox_folder]/*.md`. Warn if > 10: suggest `/consolidate`.

**Old unmerged checkpoints (>7 days)**
- The CLI's `orphan-checkpoints` check uses an *active-session* threshold (`max(60min, 2 * checkpoint.minutes)`) — anything younger may still be a live session.
- The skill check is complementary: glob `[logs_folder]/checkpoint/*-checkpoint-*.md`, keep files whose date prefix is older than 7 days. If any → 🟡 suggest `/wrapup` for the stragglers. (Pre-v2.2.0 vaults may contain `merged: true` field — ignore it; any file present is unmerged by definition.)

**07-logs structure**
- Verify the 4 subfolders exist under `[logs_folder]/`: `session/`, `checkpoint/`, `update/`, `log/`. If `[logs_folder]/YYYY/MM/` still contains legacy log files: 🟡 `legacy log structure — run /update to migrate` (and skip the per-subfolder warnings).
- Otherwise warn per missing subfolder: 🟡 `07-logs/<name>/ missing — first <type> will create it`. No warning when all 4 present.

**Log folder size (housekeeping)**
- Count `[logs_folder]/log/YYYY/` for the current year. Warn if > 1000: 🟡 `log/ folder: N files in YYYY — consider archive (move stale log/YYYY/MM/ folders to 06-archive/ manually)`. User decides retention; OneBrain has no automatic policy. Skip silently if `log/` doesn't exist.

**vault.yml `recap:` block** (the CLI's `vault.yml-keys` schema check covers required keys; `recap:` may be optional)
- If `recap:` block is absent: 🟡 `recap: block missing — /recap will use defaults (min_sessions: 6, min_frequency: 2); run /update to add it`.

**Scheduler health** — only when `vault.yml` has a `schedule:` block.
- **Errors**: glob `[logs_folder]/scheduler/**/*.err.md` from the last 7 days. If any → 🟡 report count + most recent 3 as wikilinks.
- **Consecutive failures**: for each `schedule:` entry, count consecutive `.err.md` files from newest with no intervening success `.md`. If ≥ 3 → 🔴 CRITICAL — suggest `onebrain register-schedule --resume <skill>`.
- **Schedule drift**: for each entry, check `~/Library/LaunchAgents/com.onebrain.<labelSafe>.plist` exists where `labelSafe` strips leading `/` from `entry.skill` and replaces non-`[a-zA-Z0-9-]` chars with `-`. If missing → 🟡 `onebrain register-schedule` to repair. If installed plist no longer matches a vault.yml entry → 🟡 stale plist — `onebrain register-schedule --remove` then re-register.
- **One-shot reachability**: for each `at:` entry, verify timestamp hasn't already passed. If passed and plist still exists → 🟡 expired one-shot not cleaned up.

**Pause: orphan pointer**
- Read `[logs_folder]/pause/_active.md`. If absent → skip. Parse slug. Glob `[logs_folder]/pause/*-{slug}-pause-*.md`. If empty match → ⚠️ `Pause pointer references {slug} but no snapshot files exist. Fix: rm 07-logs/pause/_active.md (or create initial /pause)`.

**Pause: missing pointer**
- Glob `[logs_folder]/pause/*-pause-*.md`. If empty → skip. If `_active.md` exists → skip. Otherwise → ⚠️ `Pause files exist but no active pointer:` + list slugs + counts + latest date. `Fix: echo "{chosen-slug}" > 07-logs/pause/_active.md`.

**Pause: idle thread**
- Read `_active.md`. If absent → skip. Glob files for the slug. Get max date prefix. If `(today - max_date).days > 14` → ⚠️ `Pause thread {slug} idle for N days (last snapshot YYYY-MM-DD). Fix: /wrapup to consolidate, or /pause to refresh, or /resume to continue`.

**Memory health** — run all checks from `references/memory-health-checks.md`. Findings go under the 🧠 Memory section.

---

## Step 3: Merge + Report

Combine CLI doctor findings (Step 2a) and skill findings (Step 2b) into one unified report.

```
──────────────────────────────────────────────────────────────
🏥 OneBrain Doctor · YYYY-MM-DD
──────────────────────────────────────────────────────────────
⚙️ Config (from `onebrain doctor`)
  <one line per CLI check — use the JSON `message` and emoji from status>

📁 Vault
  <broken-links, orphan-notes, inbox-backlog, 07-logs structure, old checkpoints, log folder size>

🧠 Memory
  <MEMORY.md size, stale memory/ files, MEMORY.md structure, memory-health checks>

📅 Scheduler   (only if schedule: block present)
  <errors, consecutive failures, drift, expired one-shots>

⏸️ Pause   (only if pause state has findings)
  <orphan pointer, missing pointer, idle thread>

──────────────────────────────────────────────────────────────
{summary line}
```

**Summary line:**
- All green → ✅ `Everything looks healthy. N checks · 0 issues.`
- Otherwise → `🔴 N issues found (M critical, P warnings). Run /doctor --fix to repair safe issues.` (use CLI's `summary` + skill issue count)

For each finding, prefer the CLI's `message` verbatim when it's from `onebrain doctor` (single source of truth for the 8 built-in checks). For skill findings, render the action-oriented form (`Fix: <command>`).

---

## Step 4: Auto-fix (`--fix` flag only)

Two-stream fix:

1. **CLI fixes** — already executed by `onebrain doctor --fix --json` in Step 2a. The JSON `fix[]` array reports outcomes (`fixed`, `failed`, `skip`). Render under each affected check.

2. **Skill fixes** — Read `references/autofix-procedures.md` and run Pass A, B, C, D in order. Each pass confirms with the user before writing. After all passes, run `onebrain qmd-reindex` as the Final step.

The CLI fix recipes cover: settings-hooks, plugin-files, vault.yml-keys, claude-settings, qmd. The skill fix passes cover: stale confidence-score updates, broken-wikilink fuzzy-match repair, MEMORY.md structure migration. Together: CLI handles config, skill handles content.

---

## On Completion

1. Update `vault.yml` `stats.last_doctor_run: YYYY-MM-DD`. If `--fix` ran: also update `stats.last_doctor_fix: YYYY-MM-DD`.

2. **Write doctor log entry.** Follow `../_shared/audit-log-format.md` (canonical frontmatter, append-per-day algorithm, run-section heading, failure mode) with:
   - **Filename:** `YYYY-MM-DD-doctor.md` — one file per day.
   - **Tags:** `[audit-log, doctor]`.
   - **Skill:** `/doctor`
   - **Per-skill discriminator:** `flags: [--vault, --config, --fix]` (subset active this run; empty list = default — all checks).

   Body template:

   ```markdown
   ## Run HH:MM

   - Flags: --vault, --config (or "default" when no flags)

   ### Findings
   - 🔴/🟡/✅ <one line per finding>

   ### Fixes Applied
   - <one line per fix; or "(none — diagnostic only)">

   ### Recommendations
   - <one line per actionable recommendation>
   ```

3. Read and follow `references/migration-safety-net.md` at the end of every `/doctor` run.

---

## Known Gotchas

- **Wikilinks in frontmatter YAML values are not navigable links.** Fields like `superseded_by: [[old-file]]` contain wikilink syntax but Obsidian doesn't resolve them. The broken-link checker already skips fenced code blocks and blockquotes; also skip any `[[...]]` that appears on a line before the closing `---` of the frontmatter block.

- **`--fix` is not transactional.** If Pass C is interrupted (user says "stop", a file write fails), previously edited files are already changed but later ones are not. Report each fixed file immediately as it completes so the user has a clear record of what was and wasn't changed.

- **vault.yml with Windows line endings (CRLF).** YAML values may have a trailing `\r` if edited on Windows. Strip trailing whitespace from any vault.yml-derived path string (e.g. `value.replace(/\s+$/, '')`) before passing it to file-existence checks, Glob, or Read — otherwise a folder named `00-inbox\r` will silently fail to match the on-disk `00-inbox/`.

- **CLI doctor JSON is the v3.x stable contract.** If the JSON shape changes in a future v3.x release, the skill MUST update accordingly (CLI repo's CHANGELOG announces schema changes). If `onebrain doctor --json` fails to parse, treat it like CLI-not-installed (fall back to skill checks only) and surface the parse error.

- **`onebrain doctor` already handles the schema-policy checks.** Don't duplicate them in skill body: `vault.yml-keys`, `plugin-files` integrity, `settings-hooks` (Stop + PostToolUse qmd), and `claude-settings` (stale marketplace) are CLI-side. The skill's job is content-level checks (wikilinks, memory, pause, scheduler) the CLI doesn't know about.
