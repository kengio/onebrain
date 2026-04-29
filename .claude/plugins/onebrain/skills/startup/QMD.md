# QMD Guide

## Search Strategy

When qmd MCP tools are available (look for `mcp__plugin_onebrain_qmd__query` in your tool list), **qmd is the default for vault content search** — not Grep. Reach for Grep only when the query is genuinely about exact text matches inside a known file.

**qmd-first decision rule:**

| Question type | Tool |
|---|---|
| "Find notes about <topic>" / "what did I write about X" / topic exploration | `mcp__plugin_onebrain_qmd__query` |
| "Notes related to / similar to Y" | `mcp__plugin_onebrain_qmd__query` (vec/hyde sub-queries) |
| "Where did I capture <fuzzy concept>" | `mcp__plugin_onebrain_qmd__query` |
| "Get me the content of <known path>" | `mcp__plugin_onebrain_qmd__get` / `multi_get` |
| "Does file X exist" / known glob pattern | `Glob` |
| "Check frontmatter field on <known file>" | `Read` |
| "Find all `- [ ] ` task lines in projects/" | `Grep` (structural pattern, not content search) |
| "Find exact string `MIN_ACTIVITY` in src/" | `Grep` (code search, not vault content) |

**Common anti-pattern to avoid:** running `Grep` over `03-knowledge/` or `04-resources/` to find notes about a topic. That is a content search — use qmd. Grep returns line matches, qmd returns ranked documents with snippets and is what was designed for that question.

**Sub-query types** (pass to `searches` parameter):
- `lex` — BM25 keyword search (exact terms, fast)
- `vec` — semantic vector search (meaning-based; requires embeddings)
- `hyde` — hypothetical document (write what the answer looks like; requires embeddings)
- Combine `lex` + `vec` for best results: `[{type:'lex', query:'error'}, {type:'vec', query:'error handling best practices'}]`
- Always pass `intent` to disambiguate and improve snippets.

**When qmd is not available** (not installed or not set up), use Glob/Grep/Read as normal — this is the default and requires no special handling.

Without embeddings, `mcp__plugin_onebrain_qmd__query` uses BM25 keyword search only. To enable semantic/similarity search (finding conceptually related notes, not just keyword matches), the user must run `/qmd embed` at least once. Suggest this if the user asks for similarity-based or "related notes" queries and qmd is available but embeddings haven't been run.

## Index Maintenance

Whenever you add, edit, or delete any file in the vault, check first whether qmd is available by looking for `mcp__plugin_onebrain_qmd__query` in your tool list. If it is available, immediately run:

```
onebrain qmd-reindex
```

This triggers a background reindex. The command reads `qmd_collection` from vault.yml and exits silently if qmd is not installed or the collection is not set. It is fire-and-forget — no need to wait for it to complete.
