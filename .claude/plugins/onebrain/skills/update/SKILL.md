---
name: update
description: "Update OneBrain system files from GitHub to the latest version. Use when the user wants to pull the latest OneBrain skills, hooks, and agents — 'update OneBrain', 'pull latest version'. Do NOT use for: updating vault notes (edit directly), teaching memory (use learn), or vault health checks (use doctor)."
schedulable: false
---

# Update

Update OneBrain system files from GitHub to the latest version.

## Version Check

1. Read current version from vault's `plugin.json` (`[agent_folder]/../../.claude-plugin/plugin.json` or `.claude/plugins/onebrain/.claude-plugin/plugin.json`)
2. Read `update_channel` from `onebrain.yml` (default: `stable` if field absent).
   Map to GitHub branch:
   - `stable` → `main`
   - `next` → `next`
   - `N.x` (e.g. `1.x`, `2.x`) → `N.x`
3. Read new version from repo's `plugin.json` on the mapped branch using `WebFetch` — never use `git` commands (they hang on Windows waiting for credentials):
   `https://raw.githubusercontent.com/onebrain-ai/onebrain/{branch}/.claude/plugins/onebrain/.claude-plugin/plugin.json`
   where `{branch}` is the mapped branch from step 2.
   Parse the `version` field from the JSON response. (⚠️ JSON parsing — see Known Gotchas: WebFetch may summarize; use `curl -fsSL` if a version mismatch is suspected.)
4. If equal → say: ✅ Already up to date — v{X.X.X}. and stop
5. If newer → WebFetch `https://raw.githubusercontent.com/onebrain-ai/onebrain/{branch}/CHANGELOG.md`; display before proceeding (do not skip or summarize — and if the fetched content already looks paraphrased, re-fetch via `curl -fsSL`; see Known Gotchas):

   ```
   ──────────────────────────────────────────────────────────────
   🔄 Update Available — v{current} → v{new}
   ──────────────────────────────────────────────────────────────
   {changelog entry verbatim}
   ```

   Then AskUserQuestion: "Update to v{new}?" Options: update / cancel

### Major Version Bump Guard

If `new_major > current_major` (e.g. vault is v1.10.0, repo branch has v2.0.0):
→ AskUserQuestion: "Major version bump detected (v{current} → v{new}) — this may include breaking changes. Proceed with update?"
Options: `update / cancel`
→ If cancel: stop immediately, no changes made
→ If update: proceed with normal confirmation flow below

Minor/patch bumps (1.10.0 → 1.10.1, 1.10.0 → 1.11.0): proceed without major version prompt.

6. AskUserQuestion: "Update to vX.X.X?"
   Options: `update / cancel`
7. If confirmed → proceed to bootstrap below

## CLI Version Check

After confirming the vault update (step 7 above), also bring the installed `onebrain` CLI up to date by delegating to the CLI's own update path.

1. **Probe whether `onebrain` is on PATH.** Use the form matching the active shell. `Get-Command` always exits 0, so on PowerShell interpret presence by stdout content (a non-empty `CommandInfo` line = present), not by exit code:
   - **Bash / zsh / Git Bash:** `onebrain --version 2>/dev/null` — non-zero exit = not installed.
   - **PowerShell:** `Get-Command onebrain -ErrorAction SilentlyContinue` — empty stdout = not installed.
   - **cmd:** `where onebrain 2>nul` — non-zero exit = not installed.

   If not installed, skip this section entirely — the CLI cannot self-update if it isn't installed; first-time CLI install lives in the README, not here.

2. **Check if a CLI self-update is available** with `onebrain update --check` (v3.1+ flag — prints the available CLI version without installing). Exit 0 + "Already up to date" message = nothing to do; skip step 3. Otherwise proceed.

3. Run `onebrain update` to perform the CLI self-update. The CLI handles everything: version comparison against the GitHub releases API, package-manager choice (`bun` on macOS/Linux, `npm` via PowerShell on Windows), install, and post-install binary validation. If already current it prints `Already up to date — @onebrain-ai/cli vX.Y.Z` and exits 0; no further action.

4. If `onebrain update` exits non-zero, surface its captured output (both stdout and stderr) verbatim to the user — `runUpdate` writes the human-readable step lines to stdout and the final error tag to stderr, so showing only stderr would hide the diagnostic context. Then continue with the rest of `/update` — CLI failure does not block the plugin sync that already completed (and re-running `/update` retries the CLI bump idempotently).

> **Why one command instead of a prompt.** `onebrain update` is the canonical CLI-update path in v3.1+ (semantic swap: in v3.0 this name meant "pull plugin"; that behavior moved to `onebrain plugin update`). Duplicating its logic here (raw `npm view` + AskUserQuestion + `npm install -g`) would drift from the CLI's own version check and validation gates. The user already confirmed `/update` at step 6; the CLI bump rides on that confirmation.

## Self-Update Bootstrap (Read-New, Execute-In-Place)

Skills are markdown instructions — the agent can read the new SKILL.md from GitHub and
follow it as instructions in the same conversation. No re-invoke needed.

GitHub raw URL template: `https://raw.githubusercontent.com/onebrain-ai/onebrain/{branch}/.claude/plugins/onebrain/{path}`
where `{branch}` is the branch mapped from `update_channel` in step 2 of Version Check.

Steps:
1. **Early bootstrap — download the latest SKILL.md:**
   Use WebFetch + Write to download this file from GitHub and write to vault. `{vault_root}` = the vault's absolute path (the current working directory — the directory containing `.claude/`). (⚠️ If the written SKILL.md looks paraphrased or shorter than the source, refetch via `curl -fsSL` — see Known Gotchas. A summarized self-update bootstrap corrupts the instructions the agent is about to follow.)

   Raw URL: `https://raw.githubusercontent.com/onebrain-ai/onebrain/{branch}/.claude/plugins/onebrain/{path}`

   Download and write:
   - `skills/update/SKILL.md`

   Path relative to `[vault]/.claude/plugins/onebrain/`.

2. Read the newly-written `[vault]/.claude/plugins/onebrain/skills/update/SKILL.md` into agent context. Follow THESE instructions (not the pre-update copy) for all remaining steps.
3. Execute migration in this order:
   **0. 07-logs structure migration (one-shot, idempotent)** — run BEFORE backup.

   **Detect**: if `[logs_folder]/YYYY/MM/` contains ANY of `*-session-*.md`, `*-checkpoint-*.md`, or `*-update-*.md` files (recursive glob), run the migration. Otherwise skip — vault is already on the new layout.

   **Migrate** (cross-shell — bash brace expansion is not portable):
   ```
   node -e "['session','checkpoint','update','log'].forEach(d => require('fs').mkdirSync(require('path').join('[logs_folder]', d), { recursive: true }))"
   ```
   Then `mv` files (atomic within same volume; iCloud Drive vault is one volume):
   - `*-session-*.md` → `[logs_folder]/session/YYYY/MM/` (**preserve** YYYY/MM)
   - `*-checkpoint-*.md` → `[logs_folder]/checkpoint/` (**flatten**)
   - `*-update-*.md` → `[logs_folder]/update/` (**flatten**)

   **Cleanup**: remove empty `[logs_folder]/YYYY/MM/` and `[logs_folder]/YYYY/`. Remove stray `.DS_Store`. Keep `[logs_folder]/.gitkeep`.

   **Idempotency on interrupt**: if `mv` is cut off mid-run, the next `/update` re-detects via the trigger above (any unmoved file in `YYYY/MM/`) and finishes the move. The trigger condition itself is the verification — no count snapshot needed. Files are never duplicated because each `mv` removes the source.

   a. Pre-migration backup: copy `[agent_folder]/MEMORY.md` → `[archive_folder]/[agent_folder]/MEMORY-YYYY-MM-DD.md`
      and `[agent_folder]/context/` → `[archive_folder]/[agent_folder]/context.YYYY-MM-DD/` (if context/ exists). The `[agent_folder]` literal under `[archive_folder]/` mirrors the source's relative path so users who remapped `folders.agent` in onebrain.yml see backups land in the matching subfolder.
   b. Sync remaining files — run these two sub-steps in parallel, then clean cache after both complete:
      - **Full vault sync:** run `onebrain plugin update --branch {branch}` (the CLI defaults the vault root to the current working directory; explicit `"$PWD"` was Bash-only and broke on PowerShell/cmd). Downloads the full GitHub tarball, syncs plugin folder (with stale file cleanup), copies README.md/CONTRIBUTING.md/CHANGELOG.md to vault root (overwrite), merges CLAUDE.md/GEMINI.md/AGENTS.md (vault is primary; injects new repo `@` imports only), pins plugin to vault, and clears plugin cache. (Pre-v3.0.2 vaults receive a one-time cleanup of the now-removed `PLUGIN-CHANGELOG.md` root file as part of the plugin folder sync.)
      - **Settings merge:** WebFetch `https://raw.githubusercontent.com/onebrain-ai/onebrain/{branch}/.claude/settings.json`, then merge into `[vault]/.claude/settings.json` (⚠️ JSON parsing — refetch via `curl -fsSL` if the response is not valid JSON; see Known Gotchas). Merge strategy (never overwrite, always additive): `permissions.allow` → union; `enabledPlugins` → merge keys (skip any `onebrain@*` key whose marketplace points to a `directory` source — repo-dev-only, not valid in vault context); `extraKnownMarketplaces` → skip (repo-dev-only config, not valid in vault context); `hooks` → skip (handled by migration Step 6).
   c. Once all step 3b sub-steps are complete, load `[vault]/.claude/plugins/onebrain/skills/update/references/migration-steps.md` and run all 8 migration steps
   d. Bump `plugin.json` version to `{new}` (last — completion signal; do not bump early)
4. Write migration log. Follow `../_shared/audit-log-format.md` (canonical frontmatter umbrella tag, failure mode) with these specifics for `/update`:

   - **Filename:** `YYYY-MM-DD-update-vX.X.X.md` — one file per update run; lives in `[logs_folder]/update/` (flat, post-v2.4.0). `/update` is the one outlier: its log lives under `[logs_folder]/update/`, NOT `[logs_folder]/log/`.
   - **Tags:** `[audit-log, update]` (umbrella tag, replacing the old `[update-log]` exception).
   - **Skill:** `/update`
   - **Per-skill discriminators in frontmatter:** `channel: stable | next | N.x` (mapped from `update_channel` in onebrain.yml), plus the existing `from_version: X.X.X` and `to_version: X.X.X`.

   **Create the `update/` directory if missing** (`mkdir -p [logs_folder]/update` or per-shell equivalent) — fresh post-v2.4.0 vaults that never ran the migration won't have the dir yet, so Step 4 must self-bootstrap.

   ```markdown
   ---
   tags: [audit-log, update]
   skill: /update
   date: YYYY-MM-DD
   channel: stable
   from_version: X.X.X
   to_version: X.X.X
   ---

   # Update Log — vX.X.X → vX.X.X

   ## Steps Completed

   - [x] Step 1: Migrated N Key Learnings → memory/ (N behavioral, N project)
   - [x] Step 2: Migrated context/ → memory/ (N files)
   - [x] Step 3: Updated frontmatter on N memory/ files
   - [x] Step 4: Restructured MEMORY.md → 3 sections
   - [x] Step 5: Created MEMORY-INDEX.md (N active entries)
   - [x] Step 6: Registered Stop hook; removed stale onebrain entries from any other event (PreCompact, PostCompact, etc.) (+ PostToolUse qmd hook if qmd_collection set)
   - [x] Step 7: /doctor — N issues
   - [x] Step 8: Initialized onebrain.yml stats + recap block

   ## Summary

   N files created, N modified, N deleted.
   ```

   - Mark each step `[x]` on completion; leave `[ ]` if skipped (with reason)
   - If a step had nothing to do (e.g. context/ already absent), write `[x] Step 2: Skipped — context/ not present`
   - If /doctor found issues in Step 7, list them under the step line
   - If Step 0 (07-logs structure migration) ran, add a one-line entry: `[x] Step 0: 07-logs migration — N files moved`. Skip if Step 0 was a no-op. (The new `[logs_folder]/{session,checkpoint,update,log}/` directory layout is itself the verification artifact — no separate `## Migration:` section needed.)

5. Report summary to user:

   For each migration step (one line per step):
   ✅ Step {N}: {description} ({N} files)
   ✅ Step {N}: Skipped — {reason}
   🟡 Step {N}: {description} — {N} issues (see above)

   Completion:
   ✅ OneBrain updated to v{new}. {N} files created, {M} modified.

## --dry-run Mode

`/update --dry-run` → run all steps WITHOUT writing. Display for each step:
```
──────────────────────────────────────────────────────────────
🔄 Dry Run — v{current} → v{new}
──────────────────────────────────────────────────────────────
Would create: `[logs_folder]/update/YYYY-MM-DD-update-vX.X.X.md`
Would modify: `[agent_folder]/MEMORY.md` — remove Key Learnings section
Would create: `[agent_folder]/memory/kebab-topic.md`
Would delete: `[agent_folder]/context/`
```
The version check, changelog display, and AskUserQuestion confirmation still happen normally in dry-run mode. No files are written, moved, or deleted. At the end say:
Dry run complete — {N} files would be created, {M} modified, {P} deleted.

## Failure Recovery

- Version stays old until plugin.json bump (step 3d) — re-running /update retries from start
- Re-running /update from the start is safe — `onebrain plugin update` downloads fresh and overwrites (idempotent)
- If vault in unrecoverable state: restore from backup in `[archive_folder]/`, then re-run /update

---

## Known Gotchas

- **Do not use git commands for the version check.** `git fetch` and `git pull` hang on Windows while waiting for credentials. Always use `WebFetch` on the raw GitHub URL to compare versions and fetch files.

- **plugin.json bump is the last step.** If /update is interrupted before step 3d, the version stays at the old number — re-running /update will retry the full migration. Do not bump plugin.json early as a progress marker.

- **MEMORY.md Key Learnings migration (migration Step 1) must run before migration Step 4.** Migration Step 4 restructures MEMORY.md; migration Step 1 reads and extracts from it. Running them in the wrong order loses the Key Learnings content before it can be promoted to memory/ files.

- **Plugin folder sync deletes stale files.** Step 3b removes files in the vault's plugin folder that no longer exist in the GitHub repo. This is intentional — the GitHub repo is the single source of truth. Do not place user customizations inside `.claude/plugins/onebrain/`; they belong at the project or user settings level.

- **Harness file merge is vault-primary.** If a user removed a plugin `@` import from CLAUDE.md/GEMINI.md/AGENTS.md (e.g., `@.claude/plugins/onebrain/INSTRUCTIONS.md`), `/update` will re-inject it on the next run because the script cannot distinguish intentional deletion from never having had it. If a specific import should stay absent, re-remove it after updating.

- **Root files live at the repo root, not the plugin folder.** `onebrain plugin update` handles all six root-level files: README.md, CONTRIBUTING.md, CHANGELOG.md (simple overwrite) and CLAUDE.md, GEMINI.md, AGENTS.md (merge — preserves user `@` imports). Never copy any of these into the plugin folder. (Pre-v3.0.2 vaults also had `PLUGIN-CHANGELOG.md` — renamed to `CHANGELOG.md` in the plugin-only trim; `onebrain plugin update` cleans up the stale `PLUGIN-CHANGELOG.md` on the next run.)

- **Failure recovery path:** If interrupted before step 3d (plugin.json bump), re-running /update will retry from step 1. The early bootstrap (download SKILL.md) is idempotent — safe to repeat.

- **CLI update delegates to `onebrain update`; plugin pull delegates to `onebrain plugin update`.** Do not call `npm install -g @onebrain-ai/cli` or `bun install -g @onebrain-ai/cli` from this skill — `onebrain update` is the single source of truth for the CLI bump (version check, package-manager choice, validation). Raw npm/bun is reserved for first-time CLI bootstrap, which is a README/install-script concern, not a `/update` concern. **v3.0 → v3.1 semantic swap:** in v3.0, `onebrain update` pulled the plugin; in v3.1 it self-updates the CLI binary, and the old plugin-pull behavior moved to `onebrain plugin update`. Don't reach for the legacy v3.0 names.

- **WebFetch may return summarized markdown — use `curl -fsSL` when raw content is required.** WebFetch can post-process content even with `raw.githubusercontent.com` URLs and explicit "return verbatim" prompts. Anywhere `/update` parses JSON (`plugin.json`, `settings.json`) or downloads/displays files verbatim (`CHANGELOG.md`, `SKILL.md`), prefer `curl -fsSL <raw-url>` via the Bash tool instead. Symptoms of a summarized fetch: version mismatch on `plugin.json`, truncated/paraphrased changelog display, corrupted SKILL.md after self-update bootstrap.
