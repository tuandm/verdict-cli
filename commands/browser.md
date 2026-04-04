---
description: Run browser commands for page verification, testing, and debugging.
argument-hint: <command> [args...]
---

Run Browse CLI commands via Bash. The server auto-starts on first call.

If browser-cli is installed globally:
```bash
browser-cli $ARGUMENTS
```

If installed locally:
```bash
npx browser-cli $ARGUMENTS
```

Common workflows:
- Verify page: `browser-cli goto <url>` then `browser-cli snapshot -i`
- Test form: `browser-cli fill @eN "text"` then `browser-cli click @eM` then `browser-cli snapshot -D`
- Check CSS: `browser-cli css @eN <property>` or `browser-cli inspect @eN`
- Auth login: `browser-cli handoff` → login manually → `browser-cli resume` → `browser-cli auth-save <name>`
