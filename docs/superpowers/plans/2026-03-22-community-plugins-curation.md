# Community Plugins Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the preinstalled community plugin list from 7 to 3 by updating the single JSON file that `install.sh` reads at vault setup time.

**Architecture:** `install.sh` reads `.obsidian/community-plugins.json` as its authoritative plugin list and installs each entry from GitHub releases. No code changes are needed — updating the JSON is the complete implementation. No Claude skills reference any community plugin, so skill behavior is unaffected.

**Tech Stack:** JSON, bash (install.sh reads the file — no changes to it required)

**Spec:** `docs/superpowers/specs/2026-03-22-community-plugins-curation-design.md`

---

## File Map

| File                               | Action | Why                       |
|------------------------------------|--------|---------------------------|
| `.obsidian/community-plugins.json` | Modify | Remove 4 plugins, keep 3  |

No other files change.

---

### Task 1: Update community-plugins.json

**Files:**

- Modify: `.obsidian/community-plugins.json`

- [ ] **Step 1: Read the current file**

```bash
cat .obsidian/community-plugins.json
```

Expected output — the current 7-plugin list:

```json
[
  "obsidian-tasks-plugin",
  "dataview",
  "templater-obsidian",
  "calendar",
  "tag-wrangler",
  "quickadd",
  "terminal"
]
```

- [ ] **Step 2: Replace with the 3-plugin list**

Overwrite `.obsidian/community-plugins.json` with exactly:

```json
[
  "obsidian-tasks-plugin",
  "dataview",
  "terminal"
]
```

- [ ] **Step 3: Verify the JSON is valid**

```bash
python3 -c "import json,sys; json.load(open('.obsidian/community-plugins.json')); print('valid')"
```

Expected: `valid`

If `python3` is unavailable:

```bash
node -e "JSON.parse(require('fs').readFileSync('.obsidian/community-plugins.json','utf8')); console.log('valid')"
```

- [ ] **Step 4: Verify the content is exactly right**

```bash
cat .obsidian/community-plugins.json
```

Confirm:

- File contains exactly 3 entries
- Present: `obsidian-tasks-plugin`, `dataview`, `terminal`
- Absent: `templater-obsidian`, `calendar`, `tag-wrangler`, `quickadd`

- [ ] **Step 5: Commit**

```bash
git add .obsidian/community-plugins.json
git commit -m "chore: reduce preinstalled plugins from 7 to 3

Keep: obsidian-tasks-plugin (task format built around it), terminal
(run Claude from Obsidian), dataview (persistent query dashboards).

Remove: quickadd (overlaps with /capture and /braindump), templater
(Claude creates notes directly), tag-wrangler (no near-term value),
calendar (no daily notes workflow in OneBrain)."
```

---

## Smoke Test (Manual)

After the commit, verify the change works end-to-end with a fresh install simulation:

- [ ] Run `install.sh` in a temp location (or inspect the plugin list it would download):

  ```bash
  grep -A5 "install_plugins" install.sh | head -20
  ```

  Confirm `install_plugins` reads `.obsidian/community-plugins.json` — no hardcoded plugin list in the script.

- [ ] Confirm the 4 removed plugins are gone from the JSON and would not be downloaded on a fresh install.

- [ ] (Optional) Open the vault in Obsidian and confirm only the 3 plugins appear under Settings → Community plugins → Installed plugins. Note: this requires Obsidian to be installed locally and the vault to be opened fresh.

---

## Rollback

If any issue is found, restore the original list:

```json
[
  "obsidian-tasks-plugin",
  "dataview",
  "templater-obsidian",
  "calendar",
  "tag-wrangler",
  "quickadd",
  "terminal"
]
```
