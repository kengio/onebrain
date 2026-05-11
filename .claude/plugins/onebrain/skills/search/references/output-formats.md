# /search Output Format Reference

## What mode template

```
📌 **Answer:** <synthesis>

📚 **Sources:**
1. `<path>:<heading>` — <excerpt under 80 chars>
2. ...
```

## Why mode template

```
🕐 **Decision chain:**

| Date | Event | Rationale |
|------|-------|-----------|
| YYYY-MM-DD | <event> | <key quote> |

📚 **Sources:** <list>
```

## Detection rules

- Input starts with "why " → why mode
- Input starts with "when did" → why mode (timeline ordering)
- Bilingual user inputs (non-English equivalents of "why" / "when") are routed to why mode via the agent's intent inference, not a literal regex match
- All other inputs → what mode
- Override via `--mode=why` or `--mode=what` flag
