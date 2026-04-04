---
name: browse-cli
description: |
  Token-efficient browser automation for AI coding agents. Use instead of Playwright MCP for all browser testing — page verification, click flows, form fills, CSS inspection, screenshots. Costs ~50-100 tokens per call vs ~1500 for MCP tools. Use when verifying web pages, checking UI renders, testing forms, inspecting CSS values, taking screenshots, or debugging frontend issues. Also use when the user mentions browser testing, page verification, visual QA, or responsive design checking.
---

# Browse CLI

Token-efficient browser automation via Bash. **Use this instead of Playwright MCP for all browser verification.**

## Setup (auto-runs on first use)

```bash
cd <project-root> && npm install browse-cli 2>/dev/null || true
B="node_modules/.bin/browse-cli"
```

## Quick Reference

```bash
# Navigate and verify
node $B goto <url>
node $B snapshot -i              # ARIA refs for interactive elements
node $B click @e3                # Click by ref
node $B fill @e5 "text"          # Fill input
node $B snapshot -D              # Diff: verify action changed page

# Inspect
node $B css @e3 font-size        # Computed CSS value
node $B inspect @e3              # Full box model + styles
node $B console                  # JS errors
node $B network                  # Network requests

# Visual
node $B screenshot /tmp/page.png
node $B responsive /tmp          # Mobile + tablet + desktop
node $B viewport 375x812         # Set viewport

# Auth (for pages requiring login)
node $B handoff                  # Opens visible Chrome for manual login
# ... log in ...
node $B resume                   # Back to headless
node $B auth-save myapp          # Save session encrypted
node $B goto-auth <url> --profile myapp  # Auto-load auth
```

## Intent → Command

| I want to... | Command |
|---|---|
| Check page loads | `goto <url>` then `snapshot -i` |
| Verify action changed page | `snapshot -D` |
| Check CSS value | `css @eN <property>` |
| Full box model + styles | `inspect @eN` |
| Take screenshot | `screenshot /tmp/page.png` |
| Test form | `fill @eN "val"` then `click @eM` then `snapshot -D` |
| Check JS errors | `console` |
| Test responsive | `responsive /tmp` |
| Multiple checks at once | `chain [["goto","url"],["snapshot","-i"],["console"]]` |

## When NOT to use (fall back to Playwright MCP)

- Drag and drop interactions
- Pixel-level screenshot comparison
- When the task plan explicitly says `QA Tool: PLAYWRIGHT_MCP`
