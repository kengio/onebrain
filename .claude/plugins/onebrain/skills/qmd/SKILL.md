---
name: qmd
description: "Set up and manage qmd search index for faster vault search. Subcommands: setup, embed, status, reindex, uninstall."
---

# /qmd : qmd Search Integration

qmd is an optional local search engine that indexes your vault for fast keyword and semantic search. When active, the agent uses it automatically for vault-wide searches.

**Usage:** `/qmd <subcommand>`

Available subcommands: `setup`, `embed`, `status`, `reindex`, `uninstall`

If no subcommand is given, show this help and list available subcommands.

---

## /qmd setup

Set up qmd for this vault. Creates a collection, stores it in vault.yml, and runs an initial index.

### Step 1: Confirm intent

Ask using AskUserQuestion:
- question: "Set up qmd for faster vault search?"
- header: "qmd Setup"
- multiSelect: false
- options:
  - label: "Yes, set up qmd", description: "Index this vault with qmd for faster search"
  - label: "Cancel", description: "Skip qmd setup"

If user selects Cancel, stop.

### Step 2: Check for existing setup

Read `vault.yml`. If `qmd_collection` key is already present:
> qmd is already configured for this vault (collection: `<value>`). To reconfigure, run `/qmd uninstall` first, then `/qmd setup` again.

Stop.

### Step 3: Check qmd installation

Run: `which qmd` (macOS/Linux) or `where qmd` (Windows).

**If qmd is NOT found:**

Ask using AskUserQuestion:
- question: "qmd is not installed. Install it now?"
- header: "Install qmd"
- multiSelect: false
- options:
  - label: "Yes, install with npm", description: "Run: npm install -g @tobilu/qmd"
  - label: "Yes, install with bun", description: "Run: bun install -g @tobilu/qmd"
  - label: "Cancel", description: "Skip for now : install manually later"

If Cancel: tell user "You can install qmd manually with `npm install -g @tobilu/qmd`, then run `/qmd setup` again." Stop.

If npm: run `npm install -g @tobilu/qmd`. If it fails, show the error and stop.
If bun: run `bun install -g @tobilu/qmd`. If it fails, show the error and stop.

After installation, verify with `which qmd` (macOS/Linux) or `where qmd` (Windows). If still not found, tell user to check their PATH and stop.

### Step 4: Generate collection name

1. Get vault root directory name: `basename "$CLAUDE_PROJECT_DIR"`
2. Generate a 6-character random hex string: try `openssl rand -hex 3` first; if that fails, try `python3 -c "import secrets; print(secrets.token_hex(3))"`. If both fail, tell the user "Could not generate a unique collection name. Please run `/qmd setup` again." and stop.
3. Collection name = `<vault-dirname>-<hex>` (e.g., `onebrain-a3f2c1`)

### Step 5: Create the qmd collection

Run:
```
qmd collection add <vault-root-path> --name <collection-name> --ignore ".obsidian/**" --ignore ".claude/**" --ignore ".git/**" --ignore "docs/**" --ignore "<archive-folder>/**" --ignore "attachments/**"
```

Where `<vault-root-path>` is the value of `$CLAUDE_PROJECT_DIR` and `<archive-folder>` is `[archive_folder]`.

If the command fails, show the error and stop.

### Step 6: Add context description

Run:
```
qmd context add "qmd://<collection-name>" "Personal Obsidian knowledge vault : notes, projects, areas, resources, and session logs"
```

If this command fails, report the error but continue (context is optional metadata).

### Step 7: Store collection name in vault.yml

Read vault.yml. Add `qmd_collection: <collection-name>` as a top-level key immediately after the `method:` line (before the `folders:` block). Write the full updated vault.yml back.

Example of updated vault.yml:
```yaml
method: onebrain
qmd_collection: onebrain-a3f2c1
folders:
  inbox: 00-inbox
  ...
```

If the write fails, show the error. Tell the user to manually add `qmd_collection: <collection-name>` to vault.yml. Stop.

### Step 8: Run initial index

Run:
```
qmd update -c <collection-name>
```

Report progress. If it fails, show the error : the collection is created but not indexed. User can run `/qmd reindex` to retry.

### Step 9: Confirm completion

Say:
──────────────────────────────────────────────────────────────
🗄️ qmd — Search Index Ready
──────────────────────────────────────────────────────────────
Collection: `{collection-name}`
Documents indexed: {N}
Embeddings: {ready / not yet — run /qmd embed to enable semantic search}

→ qmd will auto-update whenever files change in this vault
→ Run /qmd embed for semantic/similarity search (optional)
→ Run /qmd status to check index health
→ Run /qmd uninstall to remove qmd integration

---

## /qmd embed

Generate vector embeddings for semantic search.

### Step 1: Check prerequisites

Read vault.yml. If `qmd_collection` key is missing:
🔴 qmd not configured — run /qmd setup to enable vault search.

Stop.

Check `which qmd`. If not found:
> qmd is not installed. Run `/qmd setup` to install and configure it.

Stop.

### Step 2: Warn about time

Ask using AskUserQuestion:
- question: "Generating embeddings for the first time may take several minutes depending on vault size. This runs locally : no data leaves your machine. Continue?"
- header: "Generate Embeddings"
- multiSelect: false
- options:
  - label: "Yes, generate embeddings", description: "Run qmd embed : may take a few minutes for large vaults"
  - label: "Cancel", description: "Skip for now"

If Cancel, stop.

### Step 3: Run embed

Run:
```
qmd embed -c <collection-name>
```

Where `<collection-name>` is read from vault.yml `qmd_collection`.

Report completion or any errors.

### Step 4: Confirm

Say:
✅ Embeddings generated. Semantic search now active — use natural language queries.

---

## /qmd status

Show collection info and index health.

### Step 1: Check prerequisites

Read vault.yml for `qmd_collection`. If missing:
🔴 qmd not configured — run /qmd setup to enable vault search.

Stop.

Check `which qmd`. If not found:
🔴 qmd binary not found — run /qmd setup to reinstall.

Stop.

### Step 2: Run status

Run:
```
qmd collection list
```

Show the output to the user. Highlight the line for the vault's collection name.

---

## /qmd reindex

Force a full BM25 reindex of the vault collection.

### Step 1: Check prerequisites

Read vault.yml for `qmd_collection`. If missing:
🔴 qmd not configured — run /qmd setup to enable vault search.

Stop.

Check `which qmd`. If not found:
> qmd is not installed. Run `/qmd setup` to install and configure it.

Stop.

### Step 2: Run update

Run:
```
qmd update -c <collection-name>
```

Where `<collection-name>` is read from vault.yml `qmd_collection`.

Report progress and any errors.

### Step 3: Confirm

Say:
> Index updated. All vault notes are now searchable.

---

## /qmd uninstall

Remove qmd integration from this vault. Does not uninstall the qmd binary.

### Step 1: Check prerequisites

Read vault.yml. If `qmd_collection` key is missing:
> qmd is not configured for this vault. Nothing to uninstall.

Stop.

### Step 2: Confirm

Ask using AskUserQuestion:
- question: "Remove qmd integration from this vault?"
- header: "Confirm"
- multiSelect: false
- options:
  - label: "Yes, remove qmd", description: "Removes the collection and disables qmd search for this vault. Does not uninstall qmd itself."
  - label: "Cancel", description: "Keep qmd as-is"

If Cancel, stop.

### Step 3: Remove collection from qmd

Read `qmd_collection` from vault.yml. Run:
```
qmd collection remove <collection-name>
```

If qmd is not installed or the command fails, report the error but continue to Step 4 (still need to clean vault.yml).

### Step 4: Remove qmd_collection from vault.yml

Read vault.yml. Remove the `qmd_collection: ...` line. Write the full updated vault.yml back.

If the write fails, show the error. Tell the user to manually remove the `qmd_collection` line from vault.yml.

### Step 5: Confirm

Say:
> qmd search disabled for this vault. The agent will use standard Glob/Grep/Read search.
>
> You can re-enable anytime with `/qmd setup`.
