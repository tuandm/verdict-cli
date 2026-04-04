# Browse CLI

Token-efficient browser automation for AI coding agents. A persistent headless Chromium CLI that costs **~50-100 tokens per call** instead of ~1,500 with MCP-based browser tools.

Built on [Playwright](https://playwright.dev). Zero external dependencies beyond Node.js.

## Why?

AI coding agents (Claude Code, Codex CLI, Cursor) spend **30,000+ tokens per session** on browser verification through MCP protocol overhead. Browse CLI eliminates that overhead by using plain Bash commands with text output — the same ARIA snapshot technology, 15-30x cheaper.

| Tool | Per call | 20 calls | Savings |
|------|----------|----------|---------|
| Playwright MCP | ~1,500 tokens | ~30,000 tokens | — |
| **Browse CLI** | **~75 tokens** | **~1,500 tokens** | **95%** |

## Installation

```bash
npm install -g browser-cli
```

Or install locally in your project:

```bash
npm install browser-cli
```

Chromium is installed automatically via Playwright during `npm install`.

**Requirements:** Node.js 18+

## Quick Start

```bash
browser-cli goto https://example.com     # Navigate (starts server automatically)
browser-cli snapshot -i                    # Interactive elements with @e refs
browser-cli click @e3                      # Click by ref
browser-cli fill @e5 "hello"              # Fill input
browser-cli css @e3 font-size             # Get computed CSS value
browser-cli inspect @e3                    # Full box model + 16 computed styles
browser-cli screenshot /tmp/page.png      # Take screenshot
browser-cli snapshot -D                    # Diff: verify action changed the page
browser-cli stop                           # Shutdown (or auto-stops after 30 min)
```

The server auto-starts on first call (~3s). Subsequent calls take ~100-200ms. Cookies, tabs, and state persist between commands.

## Claude Code Setup

### 1. Add permissions (no approval prompts)

Add to `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(node*browser-cli*)",
      "Bash(node*browse.mjs*)",
      "Bash(npx browser-cli*)"
    ]
  }
}
```

### 2. Add a rule (guides Claude to use Browse CLI by default)

Create `.claude/rules/browser-cli.md`:

```markdown
# Browser Testing

Use Browse CLI for all browser verification:

    browser-cli goto <url>
    browser-cli snapshot -i
    browser-cli click @e3

Only fall back to Playwright MCP for drag-and-drop or pixel-diff comparisons.
```

### 3. Use in your workflow

Claude will now use Browse CLI commands via Bash instead of `mcp__playwright__*` tools:

```bash
# Instead of: mcp__playwright__browser_navigate url="..."  (~1,500 tokens)
browser-cli goto https://example.com                         # (~75 tokens)

# Instead of: mcp__playwright__browser_snapshot              (~1,500 tokens)
browser-cli snapshot -i                                       # (~75 tokens)
```

## Features

### Persistent Server

The Chromium daemon stays alive between commands. No cold starts after the first call.

- Auto-starts on first use (~3s for Chromium launch)
- Subsequent calls: ~100-200ms
- Cookies, localStorage, tabs persist between commands
- Auto-shuts down after 30 minutes idle
- Localhost-only with bearer token auth

### ARIA Snapshot with `@e` Refs

Same accessibility tree technology as Playwright MCP. Interactive elements get sequential refs:

```
@e1 - link "Home"
@e2 - button "Search"
@e3 - textbox "Email"
```

Use refs in commands: `click @e2`, `fill @e3 "user@test.com"`, `css @e1 color`

### Snapshot Diff (`-D`)

Verify an action changed the page:

```bash
browser-cli snapshot -i          # Baseline
browser-cli click @e2            # Do something
browser-cli snapshot -D          # Shows what changed
```

```diff
--- previous
+++ current
- @e5 - button "Submit"
+ @e5 - button "Loading..."
+ @e12 - text "Form submitted successfully"
```

### CSS Inspection

Read any computed CSS value or get a full box model:

```bash
browser-cli css @e3 padding          # padding: 16px
browser-cli css @e3 font-size        # font-size: 32px
browser-cli css @e3 background-color # background-color: rgb(255, 0, 0)

browser-cli inspect @e3              # Full JSON: box model + 16 computed styles
```

### Live Style Mutation

Modify CSS live with undo:

```bash
browser-cli style @e3 color red          # Set color: red (was: rgb(0, 0, 0))
browser-cli style @e3 padding 20px       # Set padding: 20px (was: 16px)
browser-cli style --history              # Show all changes
browser-cli style --undo                 # Revert last change
```

### Responsive Testing

Screenshots at mobile, tablet, and desktop in one command:

```bash
browser-cli responsive /tmp
# mobile (375x812): /tmp/browse-mobile.png
# tablet (768x1024): /tmp/browse-tablet.png
# desktop (1280x720): /tmp/browse-desktop.png
```

### Auth Profiles

Save and reload authenticated sessions. Encrypted with AES-256-CBC (machine-specific key).

```bash
# First time: log in manually
browser-cli goto https://your-app.com/login
browser-cli handoff                          # Opens visible Chrome
# ... log in (SSO, MFA, CAPTCHA) ...
browser-cli resume                           # Back to headless
browser-cli auth-save myapp                  # Save session encrypted

# Every subsequent time: one command
browser-cli goto-auth https://your-app.com/dashboard --profile myapp

# Manage profiles
browser-cli auth-list                        # List saved profiles
browser-cli auth-delete myapp                # Delete a profile
```

## Command Reference

### Navigation

| Command | Description |
|---------|-------------|
| `goto <url>` | Navigate to URL |
| `back` / `forward` / `reload` | Browser navigation |
| `url` | Current URL |
| `title` | Page title |

### Snapshot & Refs

| Command | Description |
|---------|-------------|
| `snapshot` | Full ARIA tree |
| `snapshot -i` | Interactive elements only |
| `snapshot -D` | Diff against previous snapshot |
| `snapshot -a` | Annotated screenshot with ref labels |
| `snapshot -C` | Include cursor-clickable `@c` refs |

### Interaction

| Command | Description |
|---------|-------------|
| `click <ref>` | Click element |
| `fill <ref> <text>` | Fill input field |
| `select <ref> <value>` | Select dropdown option |
| `hover <ref>` | Hover over element |
| `type <ref> <text>` | Type character by character |
| `press <key>` | Press key (Enter, Tab, Escape) |
| `scroll [ref]` | Scroll to element or page bottom |
| `wait <ms>` | Wait up to 10 seconds |

### Inspection

| Command | Description |
|---------|-------------|
| `text [ref]` | Get text content |
| `css <ref> <property>` | Get computed CSS value |
| `inspect <ref>` | Full box model + 16 computed styles (JSON) |
| `js <code>` | Execute JavaScript |
| `console` | Recent JS console messages |
| `network` | Recent network requests |
| `perf` | Navigation timing (DNS, TTFB, DOM ready, load) |

### Visual

| Command | Description |
|---------|-------------|
| `screenshot [path] [--full]` | Screenshot (viewport or full page) |
| `viewport <WxH>` | Set viewport size (e.g., `375x812`) |
| `responsive [dir]` | Screenshots at mobile + tablet + desktop |
| `style <ref> <prop> <val>` | Live CSS modification |
| `style --undo` | Undo last style change |
| `style --history` | Show all style changes |

### Auth Profiles

| Command | Description |
|---------|-------------|
| `auth-save <name>` | Save cookies + localStorage encrypted |
| `auth-load <name>` | Load a saved profile |
| `auth-list` | List saved profiles |
| `auth-delete <name>` | Delete a profile |
| `handoff` | Switch to visible browser for manual login |
| `resume` | Return to headless with authenticated session |
| `goto-auth <url> --profile <name>` | Navigate with auto-loaded auth |

### Cookies

| Command | Description |
|---------|-------------|
| `cookies [url]` | List cookies |
| `cookie-set <name> <value> <domain>` | Set cookie manually |
| `cookie-import <domain>` | Import from system Chrome |

### Tabs & Frames

| Command | Description |
|---------|-------------|
| `tabs` | List open tabs |
| `newtab [url]` / `tab <idx>` / `closetab` | Tab management |
| `frame [selector]` | Enter iframe (or list frames) |
| `frame-exit` | Return to main frame |

### Advanced

| Command | Description |
|---------|-------------|
| `diff <url1> <url2>` | Text diff between two pages |
| `chain <json>` | Batch: `[["goto","url"],["snapshot","-i"]]` |
| `status` | Server info |
| `stop` | Shutdown server |

## Architecture

```
AI Agent  →  Bash tool  →  CLI client (bin/browse.mjs)
                               ↓ HTTP POST (localhost)
                           Server (src/server.mjs)
                               ↓ Playwright API
                           Chromium (headless)
```

**CLI client**: Thin HTTP client. Reads port + token from `.browse-data/browse.json`. Auto-starts server on first call. ~1ms overhead.

**Server**: Persistent Node.js HTTP server. Random port, bearer token, localhost-only. Manages Playwright browser context, ARIA refs, auth profiles.

**Auth profiles**: AES-256-CBC encrypted with scrypt-derived key from `hostname + username`. Stored in `.browse-data/auth-profiles/`. Machine-specific — cannot be decrypted on another machine.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `BROWSE_DATA_DIR` | `.browse-data/` | Data directory (state, auth profiles) |
| `BROWSE_IDLE_TIMEOUT` | `1800000` (30 min) | Server idle shutdown in ms |
| `BROWSE_PORT` | Random | Fixed port for the server |

## Comparison

| Feature | Browse CLI | Playwright MCP | @playwright/cli | agent-browser (Vercel) |
|---------|-----------|---------------|-----------------|----------------------|
| Token cost/call | **~75** | ~1,500 | ~similar to us | ~similar |
| CSS inspection | **Yes** | No | No | No |
| Style mutation | **Yes** (undo) | No | No | No |
| Responsive presets | **Yes** | No | No | No |
| Snapshot diff | **Yes** | No | No | Yes |
| Auth profiles | **Yes** (AES-256) | No | No | Yes |
| Handoff mode | **Yes** | No | No | No |
| Batch commands | **Yes** | No | No | No |
| Persistent daemon | **Yes** | Per-session | Per-session | Yes |
| Runtime | Node.js | Node.js | Node.js | Rust + Node.js |

## License
## Acknowledgments

This project was inspired by [gstack](https://github.com/garrytan/gstack) by [Garry Tan](https://github.com/garrytan). The gstack project pioneered the idea of using a persistent Chromium daemon with a CLI interface for AI coding agents, demonstrating that plain Bash commands are dramatically more token-efficient than MCP-based browser tools. The core insight — that AI agents should talk to browsers via lightweight CLI calls instead of heavy protocol overhead — came from gstack's browse server architecture.

Browse CLI builds on this foundation with additional capabilities (CSS inspection, live style mutation, responsive presets, auth profiles with encryption, command batching) while using a pure Node.js stack with no Bun dependency.

The underlying browser automation technology is [Playwright](https://playwright.dev) by Microsoft, which provides the ARIA snapshot and element ref system that both gstack and Browse CLI rely on.

## License

[MIT](LICENSE)
