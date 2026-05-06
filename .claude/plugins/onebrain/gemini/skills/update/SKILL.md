---
name: update
description: "Update OneBrain system files from GitHub to the latest version. Use when the user wants to pull the latest OneBrain skills, hooks, and agents — 'update OneBrain', 'pull latest version'. Do NOT use for: updating vault notes (edit directly), teaching memory (use learn), or vault health checks (use doctor)."
---

# Update

Update OneBrain system files from GitHub to the latest version.

## Version Check

1. Read current version from vault's `plugin.json` (`[agent_folder]/../../.claude-plugin/plugin.json` or `.claude/plugins/onebrain/.claude-plugin/plugin.json`)
2. Read `update_channel` from `vault.yml` (default: `stable` if field absent).
   Map to GitHub branch:
   - `stable` → `main`
   - `next` → `next`
   - `N.x` (e.g. `1.x`, `2.x`) → `N.x`
3. Read new version from repo's `plugin.json` on the mapped branch using `WebFetch` — never use `git` commands (they hang on Windows waiting for credentials):
   `https://raw.githubusercontent.com/onebrain-ai/onebrain/{branch}/.claude/plugins/onebrain/.claude-plugin/plugin.json`
   where `{branch}` is the mapped branch from step 2.
   Parse the `version` field from the JSON response.
4. If equal → say: ✅ Already up to date — v{X.X.X}. and stop
5. If newer → WebFetch `https://raw.githubusercontent.com/onebrain-ai/onebrain/{branch}/PLUGIN-CHANGELOG.md`; display before proceeding (do not skip or summarize):

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

After confirming the vault update (step 7 above), also check if the installed `onebrain` CLI is up to date.

1. Run `onebrain --version 2>/dev/null` → parse installed version (e.g. `2.0.4`). If command not found → skip this section entirely.
2. Fetch latest from npm: `npm view @onebrain-ai/cli version 2>/dev/null` → parse version string. If npm unavailable or fetch fails → skip.
3. If installed = latest → skip (no output needed).
4. If newer version available:
   a. Detect available package managers. Use the form matching the active shell — PowerShell 5.1 (Win10/Server 2019 default) does not parse `||` as a control operator, so do not chain `which || where` in a single command:
      - **Bash / zsh / Git Bash:**
        ```bash
        which bun 2>/dev/null
        which npm 2>/dev/null
        ```
      - **PowerShell:** `Get-Command` always exits 0 — interpret presence by whether the command emitted a `CommandInfo` line (non-empty stdout) rather than by exit code:
        ```powershell
        Get-Command bun -ErrorAction SilentlyContinue
        Get-Command npm -ErrorAction SilentlyContinue
        ```
      - **cmd:**
        ```
        where bun 2>nul
        where npm 2>nul
        ```
   b. AskUserQuestion: "Update onebrain CLI from v{installed} to v{latest}?"
      - Both bun and npm available: options `npm / bun / skip` (npm as default)
      - Only bun: options `bun / skip`
      - Only npm: options `npm / skip`
      - Neither available: output `⚠️ CLI v{installed} is outdated (latest: v{latest}) — install npm or bun to update.` and skip
   c. If `npm` selected: run `npm install -g @onebrain-ai/cli`
   d. If `bun` selected: run `bun install -g @onebrain-ai/cli`
   e. Verify: run `onebrain --version` → confirm output matches `{latest}`

## Self-Update Bootstrap (Read-New, Execute-In-Place)

Skills are markdown instructions — the agent can read the new SKILL.md from GitHub and
follow it as instructions in the same conversation. No re-invoke needed.

GitHub raw URL template: `https://raw.githubusercontent.com/onebrain-ai/onebrain/{branch}/.claude/plugins/onebrain/{path}`
where `{branch}` is the branch mapped from `update_channel` in step 2 of Version Check.

Steps:
1. **Early bootstrap — download the latest SKILL.md:**
   Use WebFetch + Write to download this file from GitHub and write to vault. `{vault_root}` = the vault's absolute path (the current working directory — the directory containing `.claude/`).

   Raw URL: `https://raw.githubusercontent.com/onebrain-ai/onebrain/{branch}/.claude/plugins/onebrain/{path}`

   Download and write:
   - `skills/update/SKILL.md`

   Path relative to `[vault]/.claude/plugins/onebrain/`.

2. Read the newly-written `[vault]/.claude/plugins/onebrain/skills/update/SKILL.md` into agent context. Follow THESE instructions (not the pre-update copy) for all remaining steps.
3. Execute migration in this order:
   a. Pre-migration backup: copy `[agent_folder]/MEMORY.md` → `[archive_folder]/05-agent/MEMORY-YYYY-MM-DD.md`
      and `[agent_folder]/context/` → `[archive_folder]/05-agent/context.YYYY-MM-DD/` (if context/ exists)
   b. Sync remaining files — run these two sub-steps in parallel, then clean cache after both complete:
      - **Full vault sync:** run `onebrain vault-sync --branch {branch}` (the CLI defaults the vault root to the current working directory; explicit `"$PWD"` was Bash-only and broke on PowerShell/cmd). Downloads the full GitHub tarball, syncs plugin folder (with stale file cleanup), copies README.md/CONTRIBUTING.md/CHANGELOG.md/PLUGIN-CHANGELOG.md to vault root (overwrite), merges CLAUDE.md/GEMINI.md/AGENTS.md (vault is primary; injects new repo `@` imports only), pins plugin to vault, and clears plugin cache.
      - **Settings merge:** WebFetch `https://raw.githubusercontent.com/onebrain-ai/onebrain/{branch}/.claude/settings.json`, then merge into `[vault]/.claude/settings.json`. Merge strategy (never overwrite, always additive): `permissions.allow` → union; `enabledPlugins` → merge keys (skip any `onebrain@*` key whose marketplace points to a `directory` source — repo-dev-only, not valid in vault context); `extraKnownMarketplaces` → skip (repo-dev-only config, not valid in vault context); `hooks` → skip (handled by migration Step 6).
   c. Once all step 3b sub-steps are complete, load `[vault]/.claude/plugins/onebrain/skills/update/references/migration-steps.md` and run all 8 migration steps
   d. Bump `plugin.json` version to `{new}` (last — completion signal; do not bump early)
4. Write migration log to `[logs_folder]/YYYY/MM/YYYY-MM-DD-update-vX.X.X.md`:

   ```markdown
   ---
   tags: [update-log]
   date: YYYY-MM-DD
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
   - [x] Step 6: Registered Stop hook; removed stale onebrain entries from any non-allowed event (+ PostToolUse qmd hook if qmd_collection set)
   - [x] Step 7: /doctor — N issues
   - [x] Step 8: Initialized vault.yml stats + recap block

   ## Summary

   N files created, N modified, N deleted.
   ```

   - Mark each step `[x]` on completion; leave `[ ]` if skipped (with reason)
   - If a step had nothing to do (e.g. context/ already absent), write `[x] Step 2: Skipped — context/ not present`
   - If /doctor found issues in Step 7, list them under the step line

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
Would create: `[logs_folder]/YYYY/MM/YYYY-MM-DD-update-vX.X.X.md`
Would modify: `[agent_folder]/MEMORY.md` — remove Key Learnings section
Would create: `[agent_folder]/memory/kebab-topic.md`
Would delete: `[agent_folder]/context/`
```
The version check, changelog display, and AskUserQuestion confirmation still happen normally in dry-run mode. No files are written, moved, or deleted. At the end say:
Dry run complete — {N} files would be created, {M} modified, {P} deleted.

## Failure Recovery

- Version stays old until plugin.json bump (step 3d) — re-running /update retries from start
- Re-running /update from the start is safe — `onebrain vault-sync` downloads fresh and overwrites (idempotent)
- If vault in unrecoverable state: restore from backup in `[archive_folder]/`, then re-run /update

---

## Known Gotchas

- **Do not use git commands for the version check.** `git fetch` and `git pull` hang on Windows while waiting for credentials. Always use `WebFetch` on the raw GitHub URL to compare versions and fetch files.

- **plugin.json bump is the last step.** If /update is interrupted before step 3d, the version stays at the old number — re-running /update will retry the full migration. Do not bump plugin.json early as a progress marker.

- **MEMORY.md Key Learnings migration (migration Step 1) must run before migration Step 4.** Migration Step 4 restructures MEMORY.md; migration Step 1 reads and extracts from it. Running them in the wrong order loses the Key Learnings content before it can be promoted to memory/ files.

- **Plugin folder sync deletes stale files.** Step 3b removes files in the vault's plugin folder that no longer exist in the GitHub repo. This is intentional — the GitHub repo is the single source of truth. Do not place user customizations inside `.claude/plugins/onebrain/`; they belong at the project or user settings level.

- **Harness file merge is vault-primary.** If a user removed a plugin `@` import from CLAUDE.md/GEMINI.md/AGENTS.md (e.g., `@.claude/plugins/onebrain/INSTRUCTIONS.md`), `/update` will re-inject it on the next run because the script cannot distinguish intentional deletion from never having had it. If a specific import should stay absent, re-remove it after updating.

- **Root files live at the repo root, not the plugin folder.** `onebrain vault-sync` handles all seven root-level files: README.md, CONTRIBUTING.md, CHANGELOG.md, PLUGIN-CHANGELOG.md (simple overwrite) and CLAUDE.md, GEMINI.md, AGENTS.md (merge — preserves user `@` imports). Never copy any of these into the plugin folder.

- **Failure recovery path:** If interrupted before step 3d (plugin.json bump), re-running /update will retry from step 1. The early bootstrap (download SKILL.md) is idempotent — safe to repeat.
