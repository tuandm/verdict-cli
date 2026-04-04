---
description: Run browser commands for page verification, testing, and debugging.
argument-hint: <command> [args...]
---

Run Browse CLI commands via Bash. The server auto-starts on first call.

If browse-cli is installed globally:
```bash
browse-cli $ARGUMENTS
```

If installed locally:
```bash
npx browse-cli $ARGUMENTS
```

Common workflows:
- Verify page: `browse-cli goto <url>` then `browse-cli snapshot -i`
- Test form: `browse-cli fill @eN "text"` then `browse-cli click @eM` then `browse-cli snapshot -D`
- Check CSS: `browse-cli css @eN <property>` or `browse-cli inspect @eN`
- Auth login: `browse-cli handoff` → login manually → `browse-cli resume` → `browse-cli auth-save <name>`
