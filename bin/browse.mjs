#!/usr/bin/env node
/**
 * Browse CLI — Token-efficient browser automation for AI coding agents.
 * Thin client for the persistent Chromium server.
 *
 * Usage:
 *   npx browse-cli goto https://example.com
 *   npx browse-cli snapshot -i
 *   npx browse-cli click @e3
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(process.env.BROWSE_DATA_DIR || resolve(__dirname, '..', '.browse-data'));
const STATE_FILE = resolve(DATA_DIR, 'browse.json');
const SERVER_SCRIPT = resolve(__dirname, '..', 'src', 'server.mjs');

function readState() {
  try { return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : null; } catch { return null; }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function startServer() {
  const child = spawn('node', [SERVER_SCRIPT], { detached: true, stdio: 'ignore', env: { ...process.env } });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    const state = readState();
    if (state && isAlive(state.pid)) return state;
  }
  throw new Error('Server failed to start within 15 seconds');
}

async function send(state, command, args) {
  const res = await fetch(`http://127.0.0.1:${state.port}/`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${state.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ command, args })
  });
  return await res.text();
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.log(`Browse CLI — Token-efficient browser automation for AI agents

Navigation:
  goto <url>                Navigate to URL
  back / forward / reload   Browser navigation
  url / title               Current URL or page title

Snapshot & Refs:
  snapshot [-i] [-D] [-a] [-C]   ARIA tree with element refs
    -i  Interactive elements only     -D  Diff against previous
    -a  Annotated screenshot          -C  Include cursor-clickable @c refs

Interaction:
  click <ref|sel>           Click element          fill <ref> <text>     Fill input
  select <ref> <val>        Select option          hover <ref>           Hover
  type <ref> <text>         Type chars             press <key>           Press key
  scroll [ref]              Scroll to element      wait <ms>             Wait (max 10s)

Inspection:
  text [ref]                Get text content       css <ref> <prop>      Computed CSS value
  inspect <ref>             Full box model + styles js <code>             Execute JavaScript
  console                   JS console messages    network               Network requests
  perf                      Navigation timing

Visual:
  screenshot [path] [--full]  Screenshot           viewport <WxH>        Set viewport
  responsive [dir]            Mobile+tablet+desktop style <ref> <p> <v>   Live CSS edit
  style --undo / --history    Undo or show changes

Auth Profiles:
  auth-save <name>          Save session encrypted  auth-load <name>      Load profile
  auth-list                 List profiles           auth-delete <name>    Delete profile
  handoff                   Switch to visible browser for manual login
  resume                    Return to headless after login
  goto-auth <url> --profile <name>  Navigate with auto-loaded auth

Cookies:
  cookies [url]             List         cookie-set <n> <v> <dom>  Set manually
  cookie-import <domain>    Import from Chrome

Tabs:
  tabs / newtab [url] / tab <idx> / closetab

Frames:
  frame [sel]               Enter iframe   frame-exit              Return to main

Advanced:
  diff <url1> <url2>        Text diff between pages
  chain <json>              Batch: [["goto","url"],["snapshot","-i"]]
  status                    Server info    stop                    Shutdown`);
  process.exit(0);
}

let state = readState();
if (!state || !isAlive(state.pid)) {
  process.stderr.write('Starting browse server...\n');
  state = await startServer();
  process.stderr.write(`Server ready (port ${state.port})\n`);
}

try {
  console.log(await send(state, command, args));
} catch (e) {
  if (e.cause?.code === 'ECONNREFUSED' || e.message?.includes('fetch failed')) {
    process.stderr.write('Server down, restarting...\n');
    state = await startServer();
    console.log(await send(state, command, args));
  } else if (command === "stop") { console.log("Server stopped."); } else { console.error(`Error: ${e.message}`); process.exit(1); }
}
