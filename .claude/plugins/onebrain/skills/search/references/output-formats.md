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

- Input starts with "why " / "ทำไม " → why mode
- Input starts with "when did" / "เมื่อไหร่" → why mode (timeline ordering)
- All other inputs → what mode
- Override via `--mode=why` or `--mode=what` flag
