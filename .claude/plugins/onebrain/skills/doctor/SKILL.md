---
name: doctor
description: "Diagnose vault and plugin health — checks broken links, orphan notes, stale memory/ files, inbox backlog, and plugin config validity. Use when the user asks to check vault health, notices something broken, or wants a system audit — 'run /doctor', 'check my vault', 'something seems off'. Do NOT use for: searching vault content (search directly), processing inbox (use consolidate), or updating the system (use update)."
---

# Doctor

Diagnose the health of your OneBrain vault and plugin configuration. Inspired by `brew doctor` and `npm doctor`.

Usage:
- `/doctor` — full check (vault + config)
- `/doctor --vault` — vault health only
- `/doctor --config` — plugin config only
- `/doctor --fix` — auto-fix safe issues (stale confidence scores + broken wikilinks via fuzzy match)

**Flag detection:** Determine active flags from the user's message. `--vault` = user mentions vault-only or health check; `--config` = user mentions config or plugin check; `--fix` = user explicitly asks to fix or auto-fix. Default (no flags mentioned) = run all checks.

---

## Step 1: Read vault.yml

Read `vault.yml`. If it is missing, flag immediately:
> ⛔ vault.yml not found — OneBrain may not be configured correctly.

---

## Step 2: Run Checks

Run all applicable checks based on flags (default: all). Collect findings before reporting.

### Vault Checks (`--vault`)

**Broken wikilinks:**
- Grep all `.md` files in `[projects_folder]/`, `[areas_folder]/`, `[knowledge_folder]/`, `[resources_folder]/`, `[agent_folder]/` for `\[\[.*?\]\]`
- **Skip** wikilinks found inside fenced code blocks (between ` ``` ` fences), blockquote lines (lines beginning with `>`), or inline code spans (the entire `[[...]]` is enclosed within backticks on that line)
- For each wikilink, extract the note name: strip any `|display text` suffix **and** any `#anchor` fragment (e.g. `[[Note#section|label]]` → match name is `Note`; preserve full original text for display)
- Check if a `.md` file with that exact name exists anywhere in the vault (case-insensitive)
- Flag any that don't resolve; store as: `{ broken_link, display_text, anchor, source_file, source_line }` (preserving all parts for accurate replacement later)

**Orphan notes:**
- Find notes in `[knowledge_folder]/` and `[resources_folder]/` that have no inbound wikilinks from any other note
- These may be disconnected from the knowledge graph
- Report only — no auto-fix (linking requires semantic judgment; use /connect instead)

**Stale memory/ files:**
- If `[agent_folder]/MEMORY.md` does not exist, report: `🟡 MEMORY.md: not found — run /onboarding` and skip both this check and the MEMORY.md size check below
- If `memory/` folder does not exist, skip this check
- Read all `memory/` files with `status: active` or `status: needs-review`; skip `status: deprecated`
- Flag files where `verified:` frontmatter is older than 90 days
- Flag files with no `verified:` field
- Flag files with `conf: low` where `verified:` is older than 30 days (or absent)

**MEMORY.md size:**
- Count lines in `[agent_folder]/MEMORY.md`
- Warn if count > 180: suggest manually pruning Critical Behaviors — remove entries that no longer apply or have been superseded

**Inbox backlog:**
- Count files in `[inbox_folder]/*.md`
- Warn if count > 10: suggest running /consolidate

**Old unmerged checkpoints:**
- Glob `[logs_folder]/**/*-checkpoint-*.md`
- Any checkpoint file that exists is unmerged by definition — /wrapup deletes checkpoints directly after the session log is confirmed written, so leftover files indicate a session that never wrapped up. Pre-v2.2.0 vaults may contain stragglers with `merged: true` from the legacy flow; treat those the same (the field is no longer authoritative)
- Keep only files whose date (from filename) is older than 7 days
- Suggest running /wrapup

### Config Checks (`--config`)

**onebrain CLI binary:**
- Check `which onebrain` (macOS/Linux) or `where onebrain` (Windows)
- If not found: 🔴 "onebrain CLI not installed — hooks (checkpoint, qmd-reindex) will not fire; run /onboarding or `npm install -g @onebrain-ai/cli` to install" — then **skip the OneBrain hooks and qmd PostToolUse hook checks below** (mark them as N/A — root cause is the missing CLI, not the hooks)
- If found: ✅ (no output in clean state)

**vault.yml:**
- Verify all declared folder paths exist in the vault
- Check `qmd_collection` is present (warn if absent — qmd search won't work)
- Check if `timezone` key is present — it is no longer used; warn the user to remove it

**plugin.json:**
- Read `.claude/plugins/onebrain/.claude-plugin/plugin.json`
- Verify `name`, `version`, `description` fields exist and are non-empty

**Plugin install path:**
- Read `~/.claude/plugins/installed_plugins.json`
- Find the entry where key starts with `onebrain@` and `scope == "project"` and `projectPath` matches the current vault
- If not found: 🟡 "onebrain not found in installed_plugins.json — run /onboarding or /plugin to install"
- If `installPath` is inside `~/.claude/plugins/cache/` (use `Path(installPath).relative_to(Path.home() / '.claude/plugins/cache')` or check if the path string contains `/.claude/plugins/cache/` — do not use simple `startswith` on unexpanded tilde): 🔴 "Plugin loading from user cache — run /doctor --fix to pin to vault"
- If `installPath` is the vault plugin directory (ends with `.claude/plugins/onebrain`): ✅ "Plugin: vault-level"

**INSTRUCTIONS.md:**
- Check file exists at `.claude/plugins/onebrain/INSTRUCTIONS.md`
- Check `skills/startup/AUTO-SUMMARY.md` exists — if missing: 🔴 "AUTO-SUMMARY.md not found — auto session summary disabled; run /update to restore"

**vault.yml recap block:**
- Check `recap:` block is present in vault.yml
- If absent: 🟡 "`recap:` block missing from vault.yml — /recap will use defaults (min_sessions: 6, min_frequency: 2); run /update to add it"

**OneBrain hooks:**
- Read `[vault]/.claude/settings.json` (vault-level settings — the `.claude/` folder inside the vault, not `~/.claude/settings.json`)
- Check `Stop` hook: entry exists under `hooks.Stop` and command contains `checkpoint stop` → ✅ / 🔴 missing or wrong
- Check `PostCompact` hook: entry exists under `hooks.PostCompact` and command contains `checkpoint postcompact` → ✅ / 🔴 missing or wrong
- Check `PreCompact` hook: if `hooks.PreCompact` exists and command contains `checkpoint precompact` → 🟡 stale hook — suggest running /update to remove it
- Any missing or wrong required entry: include in issue count, suggest running /update to fix

**qmd PostToolUse hook (only when `qmd_collection` is set in vault.yml):**
- If `qmd_collection` is absent in vault.yml: skip this entire check
- If `qmd_collection` is present:
  - Check `which qmd` (macOS/Linux) or `where qmd` (Windows): qmd binary must be installed → ✅ / 🔴 "qmd not installed — qmd_collection is set but binary is missing; run `/qmd setup` to reinstall"
  - Read `[vault]/.claude/settings.json` (same file used for Stop/PostCompact hooks); check that `hooks.PostToolUse` contains an entry whose `command` contains `qmd-reindex` → ✅ / 🔴 "PostToolUse qmd hook missing in settings.json — run /update to register"

---

## Step 3: Report Findings

Use this format:

```
──────────────────────────────────────────────────────────────
🏥 OneBrain Doctor · YYYY-MM-DD
──────────────────────────────────────────────────────────────
📁 Vault
  🔴 Broken links (N): [[Missing Note]] in "Source Note"
  🟡 Orphan notes (N): 03-knowledge/topic/Note.md
  🟡 Inbox backlog: N files — consider /consolidate
  🟢 Checkpoints: all merged

⚙️ Config
  🔴 onebrain CLI: not installed — run /onboarding or npm install -g @onebrain-ai/cli
  🟢 vault.yml: OK
  🟢 plugin.json: OK (vX.X.X)
  ✅ Plugin: vault-level (.claude/plugins/onebrain/)
  🔴 Plugin: loading from user cache — run /doctor --fix to pin to vault
  🟡 Plugin: not found in installed_plugins.json — run /onboarding
  🔴 qmd_collection: missing — qmd search will not work
  🟡 vault.yml: `timezone` key found — no longer used, safe to remove
  🔴 OneBrain hooks: Stop missing or wrong — run /update to register
  🔴 OneBrain hooks: PostCompact missing or wrong — run /update to register
  🟡 OneBrain hooks: PreCompact is stale — run /update to remove it
  🟢 OneBrain hooks: all 2 registered correctly
  🔴 qmd: binary not installed — run /qmd setup
  🔴 qmd: PostToolUse hook missing in settings.json — run /update to register
  🟢 qmd: PostToolUse hook registered correctly

🧠 Memory
  🟡 Stale memory/ files (N): not verified in 90+ days
  🟡 MEMORY.md structure: pre-v1.10.1 Identity format — run /doctor --fix or /update
  🟡 MEMORY.md size: N lines — consider /distill to compress
  🟢 MEMORY.md size: OK (N lines)
──────────────────────────────────────────────────────────────
🔴 N issues found (M critical 🔴, P warnings 🟡)
Run `/doctor --fix` to repair.
```

If no issues:
```
✅ Everything looks healthy. No issues found.
```

---

## Step 4: Auto-fix (`--fix` flag only)

Read `references/autofix-procedures.md` and run Pass A, Pass B, Pass C, and Pass D in order.
Each pass confirms with the user before writing. Run the Final step (`onebrain qmd-reindex`) after all passes.

---

## Memory Health Checks

Run all checks from `references/memory-health-checks.md`. Add findings to the Step 3 report under the 🧠 Memory section.

---

## /doctor --fix

Ongoing maintenance procedures are in `references/autofix-procedures.md` under "Ongoing Maintenance".

---

## Migration Safety Net

Read and follow `references/migration-safety-net.md` at the end of every `/doctor` run.

---

## On Completion

Update `vault.yml` `stats.last_doctor_run: YYYY-MM-DD`.
If `--fix` was run: also update `stats.last_doctor_fix: YYYY-MM-DD`.

---

## Known Gotchas

- **Wikilinks in frontmatter YAML values are not navigable links.** Fields like `superseded_by: [[old-file]]` contain wikilink syntax but are not real links — Obsidian does not resolve them. The broken-link checker already skips fenced code blocks and blockquotes; also skip any `[[...]]` that appears on a line before the closing `---` of the frontmatter block.

- **`--fix` is not transactional.** If Pass C is interrupted (user says "stop", or a file write fails), previously edited files are already changed but later files are not. Report each fixed file immediately as it completes so the user has a clear record of what was and was not changed if something interrupts.

- **vault.yml with Windows line endings (CRLF).** If edited on Windows, YAML values may have a trailing `\r`. If a folder path existence check fails unexpectedly, strip trailing whitespace from vault.yml values before using them in file path operations.
