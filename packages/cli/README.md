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

The `onebrain` binary handles the low-level operations that keep your vault running.

**User-facing commands:**

| Command | Purpose |
|---------|---------|
| `onebrain init` | First-time vault initialization |
| `onebrain update` | Pull latest plugin files from GitHub |
| `onebrain doctor` | Audit vault health — orphan checkpoints, version drift, qmd embedding status, missing config |
| `onebrain help` | List all available commands |

**Internal commands** (not meant to be run directly):

`session-init` · `orphan-scan` · `checkpoint` · `qmd-reindex` · `vault-sync` · `register-hooks` · `migrate`

## Requirements

- macOS, Linux, or Windows (Git Bash)
- Bun or Node.js required (used as the runtime for the npm package)
- For a self-contained binary with no runtime dependency, download from [GitHub Releases](https://github.com/kengio/onebrain/releases)

## OneBrain

OneBrain gives your AI agent persistent memory across sessions, a structured Markdown vault, and 24+ pre-built skills — so every session picks up exactly where the last one left off.

**Full documentation and vault setup:** [github.com/kengio/onebrain](https://github.com/kengio/onebrain)

## License

[MIT](https://github.com/kengio/onebrain/blob/main/LICENSE)
