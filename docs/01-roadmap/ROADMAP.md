# Verdict Roadmap

> **Philosophy:** Build what makes browser testing fast, cheap, and easy for daily coding work. Share what works. Don't productize — just make a sharp tool.

> **Goal:** Cover 90%+ of browser verification cases without leaving the terminal.

---

## Phase 1: Rock-Solid Foundation (Now)

Make what exists reliable and easy to install. Nothing new — just make it work perfectly.

- [ ] **Fix cold-start race condition** — server writes state file before it's ready to accept connections. First-run experience must be flawless.
- [ ] **Homebrew tap** — `brew install tuandm/tap/verdict` for one-command install
- [ ] **Stable JSON output** — add `--json` flag to all commands so agents can parse structured output reliably
- [ ] **Better error messages** — when something fails, say what failed and why. No stack traces for user errors.
- [x] **Clean up env vars** — renamed `BROWSE_*` → `VERDICT_*`

**Done when:** Fresh `brew install && verdict goto <url> && verdict snapshot -i` works first try, every time.

---

## Phase 2: Cover the Daily Cases (After Phase 1)

These are the things you actually do during development that aren't covered yet.

- [ ] **Named sessions** — run multiple browser instances for different apps/environments
  ```bash
  verdict --session staging goto https://staging.myapp.com
  verdict --session prod goto https://prod.myapp.com
  ```
- [ ] **Network request mocking** — control API responses for testing edge cases
  ```bash
  verdict mock-route "/api/users" '{"data": []}'
  verdict block-route "*.analytics.com"
  ```
- [ ] **`a11y` command** — quick accessibility check, natural extension of CSS inspection
  ```bash
  verdict a11y              # Full page WCAG audit
  verdict a11y @e3          # Single element
  ```
- [ ] **`record` / `replay`** — save a flow once, replay it for regression checks
  ```bash
  verdict record start
  verdict goto https://myapp.com/checkout
  verdict fill @e3 "test@test.com"
  verdict click @e5
  verdict record stop checkout-flow.json
  verdict replay checkout-flow.json
  ```
- [ ] **Smarter waits** — auto-detect page stability instead of manual `wait` commands. Detect network idle, DOM stable, no pending animations.

**Done when:** You can test a full authenticated multi-page flow in your Laravel app without workarounds.

---

## Phase 3: Evidence and Artifacts (After Phase 2)

Make Verdict output useful beyond the terminal — for PRs, debugging, and sharing.

- [ ] **Artifact bundles** — each verification run can save snapshot + screenshot + console + network to a folder
  ```bash
  verdict goto https://myapp.com --save-run
  # writes .verdict/runs/2026-04-06T12-00-00/
  ```
- [ ] **`report` command** — summarize a run in markdown
  ```bash
  verdict report                    # last run
  verdict report --format markdown  # paste into PR
  ```
- [ ] **`export pr-comment`** — generate a PR comment with verification evidence
- [ ] **`export playwright`** — turn a verified flow into a Playwright test stub
  ```bash
  verdict replay checkout-flow.json --export-playwright
  # generates tests/checkout-flow.spec.ts
  ```
- [ ] **Visual regression baseline**
  ```bash
  verdict baseline save homepage
  verdict baseline compare homepage  # pixel diff
  ```

**Done when:** You can attach browser verification evidence to a PR with one command.

---

## Phase 4: Multi-Agent & CI (After Phase 3)

Make Verdict work beyond your local machine.

- [ ] **CI mode** — headless, artifact-only, deterministic output
  ```bash
  verdict ci-run checkout-flow.json --reporter junit
  ```
- [ ] **GitHub Actions integration** — sample workflow that runs Verdict checks on PRs
- [ ] **CDP attach mode** — connect to an already-running browser (Docker, remote dev)
- [ ] **MCP adapter** — expose Verdict as an MCP server for tools that don't support Bash

**Done when:** Same verification flows work locally and in CI.

---

## Not Planned (revisit if demand appears)

- Cloud browser infrastructure
- Managed dashboard / team features
- Anti-bot / stealth / CAPTCHA solving
- Paid tier / monetization
- Formal product launch / marketing site

---

## Sharing Cadence

Not a marketing plan — just sharing what you build.

- Post on r/ClaudeAI when something interesting ships
- Write up experiments and patterns that work
- Keep README honest and up to date
- Respond to issues and feedback
- Connect with other builders in the agent tooling space
