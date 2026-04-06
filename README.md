# Verdict

Token-efficient browser verification for AI coding agents.

[![Gem Version](https://img.shields.io/npm/v/verdict-cli)](https://www.npmjs.com/package/verdict-cli)
[![Build](https://github.com/tuandm/verdict-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/tuandm/verdict-cli/actions)
[![License](https://img.shields.io/npm/l/verdict-cli)](https://github.com/tuandm/verdict-cli/blob/main/LICENSE)

A persistent headless Chromium CLI. **~75 tokens per call** vs ~1,500 with Playwright MCP. Same ARIA snapshot technology, 95% cheaper.

Works with Claude Code, Codex CLI, Cursor, Copilot, and Gemini CLI.

Inspired by [gstack](https://github.com/garrytan/gstack) by [Garry Tan](https://github.com/garrytan).

## Installation

Install globally:

```bash
npm install -g verdict-cli
```

Or add to your project:

```bash
npm install verdict-cli
```

Chromium installs automatically via Playwright.

**Requirements:** Node.js 18+

## Quick Start

```bash
verdict goto https://example.com
verdict snapshot -i
verdict click @e3
verdict fill @e5 "hello"
verdict snapshot -D
verdict stop
```

The server auto-starts on first call (~3s). Subsequent calls take ~100-200ms.

## Token Savings

| Tool | Per call | 20 calls | Savings |
|------|----------|----------|---------|
| Playwright MCP | ~1,500 tokens | ~30,000 tokens | — |
| **Verdict** | **~75 tokens** | **~1,500 tokens** | **95%** |

## Usage

### Navigation

```bash
verdict goto https://example.com
verdict back
verdict forward
verdict reload
verdict url
verdict title
```

### Snapshots and Refs

Take an ARIA snapshot. Interactive elements get `@e` refs.

```bash
verdict snapshot              # full ARIA tree
verdict snapshot -i           # interactive elements only
verdict snapshot -D           # diff against previous snapshot
verdict snapshot -a           # annotated screenshot with ref labels
verdict snapshot -C           # include cursor-clickable @c refs
```

Output looks like this:

```
@e1 - link "Home"
@e2 - button "Search"
@e3 - textbox "Email"
```

Use refs in any command: `click @e2`, `fill @e3 "test"`.

### Interaction

```bash
verdict click @e3
verdict fill @e5 "user@test.com"
verdict select @e7 "Option A"
verdict hover @e2
verdict type @e5 "slow typing"
verdict press Enter
verdict scroll @e10
verdict wait 2000
```

### Snapshot Diff

Verify an action changed the page:

```bash
verdict snapshot -i
verdict click @e2
verdict snapshot -D
```

```diff
--- previous
+++ current
- @e5 - button "Submit"
+ @e5 - button "Loading..."
+ @e12 - text "Form submitted successfully"
```

### CSS Inspection

Read any computed CSS value:

```bash
verdict css @e3 padding
verdict css @e3 font-size
verdict css @e3 background-color
```

Get a full box model with 16 computed styles:

```bash
verdict inspect @e3
```

### Live Style Mutation

Modify CSS live with undo support:

```bash
verdict style @e3 color red
verdict style @e3 padding 20px
verdict style --history
verdict style --undo
```

### Responsive Testing

Screenshot at mobile, tablet, and desktop in one command:

```bash
verdict responsive /tmp
```

### Screenshots

```bash
verdict screenshot /tmp/page.png
verdict screenshot /tmp/full.png --full
verdict viewport 375x812
```

### JavaScript and Debugging

```bash
verdict js "document.title"
verdict console
verdict network
verdict perf
```

### Auth Profiles

Save and reload authenticated sessions. Encrypted with AES-256-CBC.

```bash
verdict goto https://app.com/login
verdict handoff                          # open visible Chrome
# ... log in manually (SSO, MFA, CAPTCHA) ...
verdict resume                           # back to headless
verdict auth-save myapp                  # save session encrypted
```

Reload in one command:

```bash
verdict goto-auth https://app.com/dashboard --profile myapp
```

Manage profiles:

```bash
verdict auth-list
verdict auth-delete myapp
```

### Tabs and Frames

```bash
verdict tabs
verdict newtab https://example.com
verdict tab 1
verdict closetab
verdict frame iframe#content
verdict frame-exit
```

### Batch Commands

Run multiple commands in one call:

```bash
verdict chain '[["goto","https://example.com"],["snapshot","-i"],["console"]]'
```

### Page Diff

Compare two pages:

```bash
verdict diff https://example.com https://example.com/about
```

### Cookies

```bash
verdict cookies
verdict cookie-set session abc123 example.com
verdict cookie-import example.com
```

### Server Management

```bash
verdict status
verdict stop
```

## Agent Setup

### Claude Code

Add to `.claude/settings.json`:

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

Create `.claude/rules/verdict.md`:

```markdown
Use Verdict for all browser verification:

    verdict goto <url>
    verdict snapshot -i
    verdict click @e3

Fall back to Playwright MCP for drag-and-drop only.
```

### Other Agents

Verdict works with any agent that can run Bash commands. Install globally and call `verdict` directly.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VERDICT_DATA_DIR` | `.verdict-data/` | Data directory for state and profiles |
| `VERDICT_IDLE_TIMEOUT` | `1800000` (30 min) | Server idle shutdown in ms |
| `VERDICT_PORT` | Random | Fixed port for the server |

## Architecture

```
AI Agent  →  Bash  →  CLI client (bin/browse.mjs)
                           ↓ HTTP POST (localhost)
                       Server (src/server.mjs)
                           ↓ Playwright API
                       Chromium (headless)
```

The CLI client is a thin HTTP wrapper (~1ms overhead). The server is a persistent Node.js daemon with random port, bearer token, and localhost-only binding. Auth profiles use AES-256-CBC with a scrypt-derived machine-specific key.

## Comparison

| Feature | Verdict | Playwright MCP | agent-browser |
|---------|---------|---------------|---------------|
| Token cost/call | **~75** | ~1,500 | ~similar |
| CSS inspection | **Yes** | No | No |
| Style mutation + undo | **Yes** | No | No |
| Responsive presets | **Yes** | No | No |
| Snapshot diff | **Yes** | No | Yes |
| Auth profiles (AES-256) | **Yes** | No | Yes |
| Handoff/resume | **Yes** | No | No |
| Batch commands | **Yes** | No | No |
| Persistent daemon | **Yes** | Per-session | Yes |

## Contributing

Fork the repo and create a pull request. Bug reports and feature requests welcome on [GitHub Issues](https://github.com/tuandm/verdict-cli/issues).

## License

[MIT](LICENSE)
