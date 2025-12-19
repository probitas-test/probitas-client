---
paths: "**/*.ts"
---

# Logging Rules

Use `@probitas/logger` (powered by `@logtape/logtape`).

## Key Rule

**Do not log when returning/throwing errors** - let caller handle it.

Exception: Use `debug` when context would be lost (e.g., Worker boundaries).

## Log Levels (Non-Standard)

This project uses different conventions:

| Level     | Use For                             |
| --------- | ----------------------------------- |
| **trace** | Raw bytes, detailed internal state  |
| **debug** | Package internals, flow diagnostics |
| **info**  | Scenario execution (user-facing)    |
| **warn**  | Issues in user's scenario code      |
| **error** | Bugs in package code                |
| **fatal** | Bugs causing crashes                |

## What NOT to Log

- Reporter output (already displayed)
- Expected retries/timeouts
- Errors that will be thrown to caller
