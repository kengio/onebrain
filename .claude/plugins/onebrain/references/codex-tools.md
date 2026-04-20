# Codex Tool Mapping

Skills and INSTRUCTIONS.md use Claude Code tool names. When you encounter these, use the Codex equivalent:

| INSTRUCTIONS references | Codex equivalent |
|---|---|
| `Read`, `Write`, `Edit` | Use native file tools |
| `Bash` (run commands) | Use native shell tools |
| `Glob`, `Grep` | Use native search tools |
| `WebSearch`, `WebFetch` | Use native web tools |
| `AskUserQuestion` | Ask inline via output |
| `Skill` (invoke a skill) | Skills load natively — follow instructions directly |
| `Agent` (dispatch sub-agent) | `spawn_agent` — see below |
| `mcp__plugin_onebrain_qmd__*` | Not available — use native search tools |

## Sub-agent dispatch

Enable multi-agent support in `~/.codex/config.toml`:

```toml
[features]
multi_agent = true
```

When INSTRUCTIONS or a skill dispatches an agent (inbox-classifier, tag-suggester, etc.):

1. Find the agent prompt in `.claude/plugins/onebrain/agents/[name].md`
2. Fill any template variables
3. Run: `spawn_agent(agent_type="worker", message="Your task is to perform the following.\n\n<agent-instructions>\n[filled prompt]\n</agent-instructions>\n\nExecute now.")`
4. `wait` for result, then `close_agent`

## TodoWrite → not needed

OneBrain does not use `TodoWrite` for session tracking. Task items are written directly to vault markdown files using Obsidian task syntax (`- [ ] Task 📅 YYYY-MM-DD`).
