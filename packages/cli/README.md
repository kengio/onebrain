# @onebrain-ai/cli

The CLI binary for [OneBrain](https://github.com/kengio/onebrain) — a personal AI OS built on Obsidian with persistent memory, 24+ skills, and Claude Code integration.

## Install

```bash
# with bun (recommended)
bun install -g @onebrain-ai/cli

# or with npm
npm install -g @onebrain-ai/cli
```

Verify: `onebrain --version`

## What it does

The `onebrain` binary handles the low-level operations that keep your vault running:

| Command | Purpose |
|---------|---------|
| `onebrain session-init` | Initialize a session — returns datetime, session token, and qmd status |
| `onebrain orphan-scan` | Detect unmerged checkpoint files from previous sessions |
| `onebrain checkpoint` | Write a checkpoint file mid-session |
| `onebrain qmd-reindex` | Rebuild the semantic search index |
| `onebrain doctor` | Audit vault health — orphans, version drift, missing config |
| `onebrain init` | First-time vault initialization |

These commands are called automatically by OneBrain's hooks and skills — you don't run them directly.

## Requirements

- macOS, Linux, or Windows (Git Bash)
- No Python or Node.js required — the binary is self-contained

## OneBrain

OneBrain gives your AI agent persistent memory across sessions, a structured Markdown vault, and 24+ pre-built skills — so every session picks up exactly where the last one left off.

**Full documentation and vault setup:** [github.com/kengio/onebrain](https://github.com/kengio/onebrain)

## License

[MIT](https://github.com/kengio/onebrain/blob/main/LICENSE)
