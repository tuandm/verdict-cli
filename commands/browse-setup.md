---
description: Install Browse CLI and configure permissions for token-efficient browser testing.
---

Install Browse CLI and set up permissions:

1. Install:
```bash
npm install -g browse-cli
```

2. Add to project permissions (`.claude/settings.json`):
```json
{
  "permissions": {
    "allow": [
      "Bash(browse-cli*)",
      "Bash(npx browse-cli*)"
    ]
  }
}
```

3. Verify:
```bash
browse-cli goto https://example.com
browse-cli snapshot -i
browse-cli stop
```

Report success or any errors.
