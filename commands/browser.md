---
description: Run browser commands for page verification, testing, and debugging.
argument-hint: <command> [args...]
---

Run Verdict commands via Bash. The server auto-starts on first call.

If verdict is installed globally:
```bash
verdict $ARGUMENTS
```

If installed locally:
```bash
npx verdict $ARGUMENTS
```

Common workflows:
- Verify page: `verdict goto <url>` then `verdict snapshot -i`
- Test form: `verdict fill @eN "text"` then `verdict click @eM` then `verdict snapshot -D`
- Check CSS: `verdict css @eN <property>` or `verdict inspect @eN`
- Auth login: `verdict handoff` → login manually → `verdict resume` → `verdict auth-save <name>`
