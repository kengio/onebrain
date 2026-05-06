# Gemini CLI Tool Mapping

Skills and INSTRUCTIONS.md use Claude Code tool names. When you encounter these, use the Gemini CLI equivalent:

| INSTRUCTIONS references | Gemini CLI equivalent |
|---|---|
| `Read` (file reading) | `read_file` |
| `Write` (file creation) | `write_file` |
| `Edit` (file editing) | `replace` |
| `Bash` (run commands) | `run_shell_command` |
| `Grep` (search content) | `grep_search` |
| `Glob` (search by filename) | `glob` |
| `WebSearch` | `google_web_search` |
| `WebFetch` | `web_fetch` |
| `AskUserQuestion` | `ask_user` |
| Skills (follow SKILL.md) | Read `.claude/plugins/onebrain/skills/[name]/SKILL.md` via `read_file`, then follow it — no separate tool call needed |
| `Agent` (dispatch sub-agent) | No equivalent — execute inline |
| `mcp__plugin_onebrain_qmd__*` | Not available — use `glob` + `grep_search` |

## No sub-agent support

Gemini CLI has no equivalent to Claude Code's `Agent` tool. Skills that dispatch sub-agents (inbox-classifier, tag-suggester, link-suggester, task-extractor) run their logic inline instead. Results may be slightly slower but functionally equivalent.

## Additional Gemini CLI tools

| Tool | Purpose |
|---|---|
| `list_directory` | List files and subdirectories |
| `save_memory` | Persist facts across sessions |
| `ask_user` | Request structured input from the user |
| `enter_plan_mode` / `exit_plan_mode` | Switch to read-only mode before making changes |
