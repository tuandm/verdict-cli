#!/usr/bin/env node
/**
 * Verdict — Token-efficient browser verification for AI coding agents.
 * Thin client for the persistent Chromium server.
 *
 * Usage:
 *   npx verdict goto https://example.com
 *   npx verdict snapshot -i
 *   npx verdict click @e3
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DATA_DIR = resolve(process.env.VERDICT_DATA_DIR || resolve(__dirname, '..', '.verdict-data'));
const SERVER_SCRIPT = resolve(__dirname, '..', 'src', 'server.mjs');

// Parse --session <name> and --json from argv early
const rawArgs = process.argv.slice(2);
const jsonFlag = rawArgs.includes('--json');
let sessionName = null;
const filtered = [];
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i] === '--json') continue;
  if (rawArgs[i] === '--session' && rawArgs[i + 1]) { sessionName = rawArgs[++i]; continue; }
  filtered.push(rawArgs[i]);
}
const [command, ...args] = filtered;

const DATA_DIR = sessionName ? resolve(BASE_DATA_DIR, 'sessions', sessionName) : BASE_DATA_DIR;
const STATE_FILE = resolve(DATA_DIR, 'verdict.json');

function readState() {
  try { return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : null; } catch { return null; }
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function startServer() {
  const env = { ...process.env };
  if (sessionName) env.VERDICT_SESSION = sessionName;
  const child = spawn('node', [SERVER_SCRIPT], { detached: true, stdio: 'ignore', env });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 250));
    const state = readState();
    if (state && isAlive(state.pid)) {
      // Verify the server actually responds before returning
      try {
        const res = await fetch(`http://127.0.0.1:${state.port}/`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${state.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'status', args: [] })
        });
        if (res.ok) return state;
      } catch {}
    }
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

function output(text) {
  if (jsonFlag) console.log(JSON.stringify({ status: 'ok', data: text }));
  else console.log(text);
}
function outputError(msg) {
  if (jsonFlag) { console.log(JSON.stringify({ status: 'error', error: msg })); process.exit(1); }
  else { console.error(`Error: ${msg}`); process.exit(1); }
}

if (!command) {
  console.log(`Verdict — Token-efficient browser verification for AI coding agents

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

Sessions:
  --session <name>          Run command in a named session
  sessions list             List active sessions
  sessions stop <name>      Stop a named session

Advanced:
  diff <url1> <url2>        Text diff between pages
  chain <json>              Batch: [["goto","url"],["snapshot","-i"]]
  status                    Server info    stop                    Shutdown`);
  process.exit(0);
}

// Client-side "sessions" command
if (command === 'sessions') {
  const sub = args[0];
  const sessionsDir = resolve(BASE_DATA_DIR, 'sessions');
  if (sub === 'list' || !sub) {
    const lines = [];
    // Check default (non-session) instance
    const defaultState = (() => { try { const f = resolve(BASE_DATA_DIR, 'verdict.json'); return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; } catch { return null; } })();
    if (defaultState && isAlive(defaultState.pid)) lines.push(`(default)  port=${defaultState.port}  pid=${defaultState.pid}  started=${defaultState.started}`);
    // Check named sessions
    if (existsSync(sessionsDir)) {
      for (const name of readdirSync(sessionsDir)) {
        try {
          const sf = resolve(sessionsDir, name, 'verdict.json');
          if (!existsSync(sf)) continue;
          const s = JSON.parse(readFileSync(sf, 'utf8'));
          const alive = isAlive(s.pid);
          lines.push(`${name}  port=${s.port}  pid=${s.pid}  started=${s.started}  ${alive ? 'running' : 'dead'}`);
        } catch {}
      }
    }
    output(lines.length ? lines.join('\n') : 'No active sessions.');
    process.exit(0);
  } else if (sub === 'stop') {
    const target = args[1];
    if (!target) { outputError('Session name required. Usage: verdict sessions stop <name>'); }
    const sf = resolve(sessionsDir, target, 'verdict.json');
    if (!existsSync(sf)) { outputError(`Session "${target}" not found.`); }
    try {
      const s = JSON.parse(readFileSync(sf, 'utf8'));
      await fetch(`http://127.0.0.1:${s.port}/`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${s.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'stop', args: [] })
      });
      output(`Session "${target}" stopped.`);
    } catch { output(`Session "${target}" stopped (was not responding).`); }
    process.exit(0);
  } else {
    outputError(`Unknown sessions subcommand: ${sub}. Use: sessions list, sessions stop <name>`);
  }
}

let state = readState();
if (!state || !isAlive(state.pid)) {
  process.stderr.write('Starting verdict server...\n');
  state = await startServer();
  process.stderr.write(`Server ready (port ${state.port})\n`);
}

try {
  output(await send(state, command, args));
} catch (e) {
  if (e.cause?.code === 'ECONNREFUSED' || e.cause?.code === 'UND_ERR_SOCKET' || e.message?.includes('fetch failed')) {
    process.stderr.write('Server down, restarting...\n');
    state = await startServer();
    output(await send(state, command, args));
  } else if (command === "stop") { output("Server stopped."); } else { outputError(e.message); }
}
