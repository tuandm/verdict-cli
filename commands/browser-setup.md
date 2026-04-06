---
description: Install Verdict and configure permissions for token-efficient browser verification.
---

Install Verdict and set up permissions:

1. Install:
```bash
npm install -g verdict-cli
```

2. Add to project permissions (`.claude/settings.json`):
```json
{
  "permissions": {
    "allow": [
      "Bash(verdict*)",
      "Bash(npx verdict*)"
    ]
  }
}
```

3. Verify:
```bash
verdict goto https://example.com
verdict snapshot -i
verdict stop
```

Report success or any errors.
