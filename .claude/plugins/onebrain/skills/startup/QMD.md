# QMD Guide

## Search Strategy

When qmd MCP tools are available (look for `mcp__plugin_onebrain_qmd__query` in your tool list), prefer them for vault content searches:

- **Use `mcp__plugin_onebrain_qmd__query`** for broad, natural-language searches: "find notes about machine learning", "what did I write about project X", topic exploration across the vault
- **Use `mcp__plugin_onebrain_qmd__get` / `mcp__plugin_onebrain_qmd__multi_get`** to retrieve full document content after identifying relevant results
- **Use Glob/Grep/Read** for precise lookups: specific file paths, exact string matches, frontmatter field checks, file existence checks

When qmd tools are NOT available (not installed or not set up), use Glob/Grep/Read as normal — this is the default and requires no special handling.

Without embeddings, `mcp__plugin_onebrain_qmd__query` uses BM25 keyword search only. To enable semantic/similarity search (finding conceptually related notes, not just keyword matches), the user must run `/qmd embed` at least once. Suggest this if the user asks for similarity-based or "related notes" queries and qmd is available but embeddings haven't been run.

## Index Maintenance

Whenever you add, edit, or delete any file in the vault, check first whether qmd is available by looking for `mcp__plugin_onebrain_qmd__query` in your tool list. If it is available, immediately run:

```
onebrain qmd-reindex
```

This triggers a background reindex. The command reads `qmd_collection` from vault.yml and exits silently if qmd is not installed or the collection is not set. It is fire-and-forget — no need to wait for it to complete.
