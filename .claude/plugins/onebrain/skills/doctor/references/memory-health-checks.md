# Memory Health Checks — Reference

Used by `/doctor` Step 2 (Vault Checks) and Step 4 (`--fix` flag).

| Check | Action |
|---|---|
| MEMORY-INDEX.md missing | AskUserQuestion: "MEMORY-INDEX.md not found — create an empty one?" `yes / no` |
| Files in memory/ not in MEMORY-INDEX.md | Read frontmatter; skip `status: deprecated`; list remaining as orphans |
| Rows in MEMORY-INDEX.md pointing to missing files | List dead links |
| Files with `verified` > 90 days | Check active/needs-review only (skip deprecated); auto-set `status: needs-review` in file and MEMORY-INDEX.md |
| Critical Behaviors section > 15 items | Warn: suggest moving excess to memory/ |
| MEMORY.md `## Identity & Personality` uses old 6-field labels (`**Agent name:**`, `**User name:**`) | Warn: "MEMORY.md Identity block uses pre-v1.10.1 format — run /doctor --fix or /update to migrate" |
| Checkpoint files > 14 days old with no session log | AskUserQuestion: "Found {N} checkpoints >14 days old with no session log — delete all?" `delete-all / show-list / skip` (pre-v2.2.0 vaults: ignore the `merged:` frontmatter field if present — it is no longer authoritative) |
| memory/ files with non-compliant names | List offenders (not kebab-case, has date prefix, or >5 words); `--fix` auto-renames |
| memory/ files with non-default `type` AND not used by 2+ files | Warn possible typo; suggest nearest default via Levenshtein distance ≤2 |
| `recapped` date in the future (>today) | Warn — likely manual mistake; suggest correcting |
| `vault.yml` `recap.min_frequency` < 2 or non-integer | Warn invalid config; `--fix` resets to default 2 |
| `vault.yml` `update_channel` invalid value | Warn: must be `stable`, `next`, or `N.x` pattern (e.g. `1.x`); suggest correcting or removing the field to use default (`stable`) |
