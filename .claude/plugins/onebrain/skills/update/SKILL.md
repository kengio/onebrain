---
name: update
description: Update OneBrain skills, config, and plugins from GitHub — never touches your notes or data
triggers:
  - /update
  - update
---

# Update OneBrain

Fetch the latest OneBrain system files from GitHub and apply them to this vault.
Your notes, memory, and personal settings are never touched.

---

## Step 1: Explain & Confirm

Tell the user what will and won't be updated:

**WILL update (system files only):**
- `CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, `README.md`, `.gitignore`
- `.claude/plugins/onebrain/` — all skills, hooks, and agents
- `.obsidian/plugins/` — bundled plugin files
- `.obsidian/app.json`, `.obsidian/core-plugins.json`, `.obsidian/community-plugins.json`

**WILL NOT touch (your data and preferences):**
- `00-inbox/`, `01-projects/`, `02-knowledge/`, `03-archive/`, `04-memory-log/` — all your notes
- `MEMORY.md` — your identity and session context
- `.obsidian/themes/` — your chosen theme
- `.obsidian/appearance.json` — your theme preference
- `.obsidian/workspace.json` — your panel layout
- `.obsidian/hotkeys.json` — your keybindings
- `.claude/settings.local.json` — your local Claude settings
- `.claude/onebrain.local.md` — your local plugin config
- `install.sh` — only used for fresh installs

Ask: **"Proceed with update?"** and wait for confirmation before continuing.

---

## Step 2: Check Dependencies

Verify required tools are available:

```bash
for cmd in curl tar rsync diff; do
  command -v "$cmd" >/dev/null 2>&1 || echo "MISSING: $cmd"
done
```

If any are missing, tell the user which tool is missing and stop. On macOS, `rsync` and `diff` are built-in; `curl` and `tar` are too.

---

## Step 3: Download & Extract

Download the latest tarball to a temp directory, validate it, and extract:

```bash
TMPDIR=$(mktemp -d)
TARBALL="$TMPDIR/onebrain-main.tar.gz"

curl -fsSL "https://github.com/kengio/onebrain/archive/refs/heads/main.tar.gz" -o "$TARBALL"

# Validate
gzip -t "$TARBALL" || { echo "Download corrupted — aborting."; rm -rf "$TMPDIR"; exit 1; }

# Extract
tar -xzf "$TARBALL" -C "$TMPDIR"

# Find extracted directory (typically onebrain-main)
UPSTREAM=$(find "$TMPDIR" -maxdepth 1 -type d -name "onebrain-*" | head -1)
echo "Extracted to: $UPSTREAM"
```

If download or extraction fails, show the error, clean up the temp dir, and stop.

---

## Step 4: Compare & Report

Use the allowlist below to diff each path. Show a summary: **N modified, N new, N unchanged**.

**Allowlist — paths to check and potentially update:**

| Path | Type |
|------|------|
| `CLAUDE.md` | file |
| `GEMINI.md` | file |
| `AGENTS.md` | file |
| `README.md` | file |
| `.gitignore` | file |
| `.claude/plugins/onebrain/` | directory |
| `.obsidian/plugins/` | directory |
| `.obsidian/app.json` | file |
| `.obsidian/core-plugins.json` | file |
| `.obsidian/community-plugins.json` | file |

For each item in the allowlist:

```bash
VAULT="/path/to/vault"   # current working directory

# For files:
diff -q "$UPSTREAM/CLAUDE.md" "$VAULT/CLAUDE.md" >/dev/null 2>&1 && echo "unchanged: CLAUDE.md" || echo "modified: CLAUDE.md"

# For directories:
diff -rq "$UPSTREAM/.claude/plugins/onebrain/" "$VAULT/.claude/plugins/onebrain/" >/dev/null 2>&1 && echo "unchanged: .claude/plugins/onebrain/" || echo "modified: .claude/plugins/onebrain/"
```

If a path exists upstream but not locally, report it as **new**.
If a path exists locally but not upstream, skip it (don't delete user files).

Present the summary before asking to apply. Example:
> Found: 2 modified, 1 new, 7 unchanged.
> Modified: `.claude/plugins/onebrain/`, `CLAUDE.md`
> New: `.obsidian/plugins/new-plugin/`
>
> Apply these updates?

Wait for confirmation.

---

## Step 5: Apply Updates

After user confirms, apply each changed or new item from the allowlist:

```bash
VAULT="$(pwd)"

# Individual files — simple copy
cp "$UPSTREAM/CLAUDE.md" "$VAULT/CLAUDE.md"
cp "$UPSTREAM/GEMINI.md" "$VAULT/GEMINI.md"
cp "$UPSTREAM/AGENTS.md" "$VAULT/AGENTS.md"
cp "$UPSTREAM/README.md" "$VAULT/README.md"
cp "$UPSTREAM/.gitignore" "$VAULT/.gitignore"

# Config files (only if present upstream)
[ -f "$UPSTREAM/.obsidian/app.json" ]               && cp "$UPSTREAM/.obsidian/app.json"               "$VAULT/.obsidian/app.json"
[ -f "$UPSTREAM/.obsidian/core-plugins.json" ]      && cp "$UPSTREAM/.obsidian/core-plugins.json"      "$VAULT/.obsidian/core-plugins.json"
[ -f "$UPSTREAM/.obsidian/community-plugins.json" ] && cp "$UPSTREAM/.obsidian/community-plugins.json" "$VAULT/.obsidian/community-plugins.json"

# Directory trees — rsync with --delete so removed upstream files are cleaned up locally
rsync -a --delete "$UPSTREAM/.claude/plugins/onebrain/" "$VAULT/.claude/plugins/onebrain/"
rsync -a --delete "$UPSTREAM/.obsidian/plugins/"        "$VAULT/.obsidian/plugins/"
```

---

## Step 6: Clean Up & Report

Remove the temp directory:

```bash
rm -rf "$TMPDIR"
```

Show a final summary of what was updated. Then suggest:

> **Done.** OneBrain has been updated.
>
> Next steps:
> - **Restart Obsidian** if any plugins were updated (`.obsidian/plugins/` changed)
> - **Restart your AI session** if system instructions changed (`CLAUDE.md`, `GEMINI.md`, or `AGENTS.md`)
