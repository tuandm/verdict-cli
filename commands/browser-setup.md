---
description: Install Browse CLI and configure permissions for token-efficient browser testing.
---

Install Browse CLI and set up permissions:

1. Install:
```bash
npm install -g browser-cli
```

2. Add to project permissions (`.claude/settings.json`):
```json
{
  "permissions": {
    "allow": [
      "Bash(browser-cli*)",
      "Bash(npx browser-cli*)"
    ]
  }
}
```

3. Verify:
```bash
browser-cli goto https://example.com
browser-cli snapshot -i
browser-cli stop
```

Report success or any errors.
