#!/usr/bin/env node
/**
 * Verdict Server — Persistent headless Chromium daemon
 * Token-efficient browser verification for AI coding agents.
 * Speaks HTTP on localhost, controlled by the verdict CLI client.
 */
import { createServer } from 'node:http';
import { writeFileSync, readFileSync, unlinkSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_DATA_DIR = resolve(process.env.VERDICT_DATA_DIR || resolve(__dirname, '..', '.verdict-data'));
const DATA_DIR = process.env.VERDICT_SESSION
  ? resolve(BASE_DATA_DIR, 'sessions', process.env.VERDICT_SESSION)
  : BASE_DATA_DIR;
const STATE_FILE = resolve(DATA_DIR, 'verdict.json');
const AUTH_DIR = resolve(DATA_DIR, 'auth-profiles');
const IDLE_TIMEOUT = parseInt(process.env.VERDICT_IDLE_TIMEOUT) || 30 * 60 * 1000;

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(AUTH_DIR, { recursive: true });

// Encryption for auth profiles — machine-specific key
const MACHINE_KEY = scryptSync(
  `${hostname()}-${userInfo().username}-verdict-cli`,
  'verdict-cli-salt-v1',
  32
);

function encryptData(data) {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', MACHINE_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return JSON.stringify({ iv: iv.toString('hex'), data: encrypted.toString('hex') });
}

function decryptData(raw) {
  const { iv, data } = JSON.parse(raw);
  const decipher = createDecipheriv('aes-256-cbc', MACHINE_KEY, Buffer.from(iv, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

function profilePath(name) {
  return resolve(AUTH_DIR, `${name}.enc`);
}

// Import Playwright
const { chromium } = await import('playwright');

let browser, context, page;
let idleTimer;
const refs = new Map();
const cursorRefs = new Map();
let refCounter = 0;
let cursorRefCounter = 0;
let lastSnapshot = '';
let previousSnapshot = '';
const styleHistory = [];

function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(shutdown, IDLE_TIMEOUT);
}

async function shutdown() {
  try { if (browser) await browser.close(); } catch {}
  try { if (existsSync(STATE_FILE)) unlinkSync(STATE_FILE); } catch {}
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Launch browser
browser = await chromium.launch({ headless: true });
context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
page = await context.newPage();

// Parse ARIA snapshot into refs
function parseAriaSnapshot(snapshot) {
  refs.clear();
  refCounter = 0;
  const lines = snapshot.split('\n');
  const output = [];
  for (const line of lines) {
    const match = line.match(/- ([\w]+)(?:\s+"([^"]*)")?/);
    if (match) {
      const role = match[1];
      const name = match[2] || '';
      const interactiveRoles = [
        'link', 'button', 'textbox', 'checkbox', 'radio', 'combobox',
        'menuitem', 'tab', 'switch', 'slider', 'spinbutton', 'searchbox',
        'option', 'menuitemcheckbox', 'menuitemradio', 'treeitem'
      ];
      if (interactiveRoles.includes(role)) {
        refCounter++;
        const ref = `@e${refCounter}`;
        const locator = name
          ? page.getByRole(role, { name, exact: false })
          : page.getByRole(role);
        refs.set(ref, { locator, role, name });
        output.push(`${ref} ${line.trim()}`);
      } else {
        output.push(line.trimEnd());
      }
    } else if (line.trim()) {
      output.push(line.trimEnd());
    }
  }
  return output.join('\n');
}

async function resolveRef(selector) {
  if (selector.startsWith('@e')) {
    const entry = refs.get(selector);
    if (!entry) throw new Error(`Unknown ref: ${selector}. Run 'snapshot' first.`);
    const count = await entry.locator.count();
    if (count === 0) throw new Error(`Stale ref: ${selector}. Element gone. Run 'snapshot' again.`);
    if (count > 1) return entry.locator.first();
    return entry.locator;
  }
  return page.locator(selector);
}

// ─── Command handlers ───────────────────────────────────────────────────────

const commands = {

  // Navigation
  async goto(args) {
    const url = args[0];
    if (!url) return 'Error: URL required';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    return `Navigated to ${page.url()}`;
  },
  async back() { await page.goBack({ waitUntil: 'domcontentloaded' }); return `Back to ${page.url()}`; },
  async forward() { await page.goForward({ waitUntil: 'domcontentloaded' }); return `Forward to ${page.url()}`; },
  async reload() { await page.reload({ waitUntil: 'domcontentloaded' }); return `Reloaded ${page.url()}`; },
  async url() { return page.url(); },
  async title() { return await page.title(); },

  // Snapshot
  async snapshot(args) {
    const interactiveOnly = args.includes('-i');
    const diffMode = args.includes('-D');
    const annotate = args.includes('-a');
    const cursorMode = args.includes('-C');
    try {
      if (diffMode) previousSnapshot = lastSnapshot;
      const snap = await page.locator('body').ariaSnapshot({ timeout: 5000 });
      lastSnapshot = parseAriaSnapshot(snap);

      if (cursorMode) {
        const clickables = await page.evaluate(() => {
          const results = [];
          document.querySelectorAll('*').forEach((el) => {
            const style = getComputedStyle(el);
            const isClickable = style.cursor === 'pointer' || el.hasAttribute('onclick') ||
              (el.hasAttribute('tabindex') && parseInt(el.getAttribute('tabindex')) >= 0);
            const isAria = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
            if (isClickable && !isAria && el.offsetParent !== null) {
              const tag = el.tagName.toLowerCase();
              const cls = el.className ? `.${el.className.toString().split(' ')[0]}` : '';
              const nth = Array.from(el.parentElement?.children || []).indexOf(el) + 1;
              results.push({ selector: `${tag}${cls}:nth-child(${nth})`, text: el.textContent?.slice(0, 40)?.trim() });
            }
          });
          return results.slice(0, 30);
        });
        cursorRefs.clear();
        cursorRefCounter = 0;
        for (const item of clickables) {
          cursorRefCounter++;
          cursorRefs.set(`@c${cursorRefCounter}`, { selector: item.selector });
          lastSnapshot += `\n@c${cursorRefCounter} - clickable "${item.text}"`;
        }
      }

      if (annotate) {
        await page.evaluate((refsData) => {
          for (const { ref, selector } of refsData) {
            const el = document.querySelector(selector);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            const label = document.createElement('div');
            label.className = '__browse_annotation';
            label.textContent = ref;
            Object.assign(label.style, {
              position: 'fixed', left: `${rect.left}px`, top: `${rect.top - 18}px`,
              background: '#f00', color: '#fff', fontSize: '11px', padding: '1px 4px',
              borderRadius: '3px', zIndex: '99999', fontFamily: 'monospace'
            });
            document.body.appendChild(label);
          }
        }, Array.from(refs.entries()).map(([ref, { role }]) => ({ ref, selector: `[role="${role}"]` })));
        await page.screenshot({ path: '/tmp/verdict-annotated.png', fullPage: false });
        await page.evaluate(() => document.querySelectorAll('.__browse_annotation').forEach(el => el.remove()));
        lastSnapshot += '\nAnnotated screenshot saved to /tmp/verdict-annotated.png';
      }

      if (diffMode && previousSnapshot) {
        const prev = previousSnapshot.split('\n');
        const curr = lastSnapshot.split('\n');
        const added = curr.filter(l => !prev.includes(l)).map(l => `+ ${l}`);
        const removed = prev.filter(l => !curr.includes(l)).map(l => `- ${l}`);
        if (!added.length && !removed.length) return 'No changes detected.';
        return `--- previous\n+++ current\n${removed.join('\n')}\n${added.join('\n')}`;
      }

      if (interactiveOnly) {
        return lastSnapshot.split('\n').filter(l => l.match(/^@[ec]\d+/)).join('\n') || 'No interactive elements found.';
      }
      return lastSnapshot;
    } catch (e) { return `Snapshot failed: ${e.message}`; }
  },

  // Interaction
  async click(args) {
    const sel = args[0]; if (!sel) return 'Error: selector required';
    await (await resolveRef(sel)).click({ timeout: 5000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    return `Clicked ${sel}`;
  },
  async fill(args) {
    const sel = args[0], val = args.slice(1).join(' ');
    if (!sel || !val) return 'Error: selector and value required';
    await (await resolveRef(sel)).fill(val, { timeout: 5000 });
    return `Filled ${sel} with "${val}"`;
  },
  async select(args) {
    const sel = args[0], val = args.slice(1).join(' ');
    if (!sel || !val) return 'Error: selector and value required';
    await (await resolveRef(sel)).selectOption(val, { timeout: 5000 });
    return `Selected "${val}" in ${sel}`;
  },
  async hover(args) {
    const sel = args[0]; if (!sel) return 'Error: selector required';
    await (await resolveRef(sel)).hover({ timeout: 5000 });
    return `Hovered ${sel}`;
  },
  async type(args) {
    const sel = args[0], text = args.slice(1).join(' ');
    if (!sel || !text) return 'Error: selector and text required';
    await (await resolveRef(sel)).pressSequentially(text, { delay: 50 });
    return `Typed "${text}" into ${sel}`;
  },
  async press(args) {
    const key = args[0]; if (!key) return 'Error: key required (Enter, Tab, Escape)';
    await page.keyboard.press(key);
    return `Pressed ${key}`;
  },
  async scroll(args) {
    if (args[0]) { await (await resolveRef(args[0])).scrollIntoViewIfNeeded({ timeout: 5000 }); return `Scrolled to ${args[0]}`; }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    return 'Scrolled to bottom';
  },
  async wait(args) { const ms = Math.min(parseInt(args[0]) || 1000, 10000); await page.waitForTimeout(ms); return `Waited ${ms}ms`; },

  // Inspection
  async text(args) {
    const t = await (await resolveRef(args[0] || 'body')).innerText({ timeout: 5000 });
    return t.length > 3000 ? t.slice(0, 3000) + '\n... (truncated)' : t;
  },
  async css(args) {
    const sel = args[0], prop = args[1];
    if (!sel || !prop) return 'Error: selector and property required';
    const el = await (await resolveRef(sel)).elementHandle();
    return `${prop}: ${await el.evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop)}`;
  },
  async inspect(args) {
    const sel = args[0]; if (!sel) return 'Error: selector required';
    const el = await (await resolveRef(sel)).elementHandle();
    const result = await el.evaluate((e) => {
      const cs = getComputedStyle(e);
      const rect = e.getBoundingClientRect();
      const box = {
        content: { width: rect.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), height: rect.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) },
        padding: { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft },
        border: { top: cs.borderTopWidth, right: cs.borderRightWidth, bottom: cs.borderBottomWidth, left: cs.borderLeftWidth },
        margin: { top: cs.marginTop, right: cs.marginRight, bottom: cs.marginBottom, left: cs.marginLeft },
      };
      const styles = {};
      for (const p of ['display','position','color','background-color','font-size','font-weight','font-family','line-height','text-align','overflow','z-index','opacity','visibility','flex-direction','gap','grid-template-columns'])
        styles[p] = cs.getPropertyValue(p);
      return { tag: e.tagName.toLowerCase(), id: e.id, classes: e.className?.toString(), boundingBox: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }, boxModel: box, computedStyles: styles };
    });
    return JSON.stringify(result, null, 2);
  },
  async js(args) {
    const code = args.join(' '); if (!code) return 'Error: JavaScript code required';
    const r = await page.evaluate(code);
    return typeof r === 'object' ? JSON.stringify(r, null, 2) : String(r ?? 'undefined');
  },
  async console() { return consoleMessages.slice(-20).join('\n') || 'No console messages.'; },
  async network() { return networkRequests.slice(-20).map(r => `${r.method} ${r.status} ${r.url}`).join('\n') || 'No network requests.'; },
  async perf() {
    const t = await page.evaluate(() => { const t = performance.getEntriesByType('navigation')[0]; if (!t) return null; return { dns: Math.round(t.domainLookupEnd - t.domainLookupStart), tcp: Math.round(t.connectEnd - t.connectStart), ttfb: Math.round(t.responseStart - t.requestStart), download: Math.round(t.responseEnd - t.responseStart), domParse: Math.round(t.domInteractive - t.responseEnd), domReady: Math.round(t.domContentLoadedEventEnd - t.startTime), load: Math.round(t.loadEventEnd - t.startTime) }; });
    return t ? Object.entries(t).map(([k, v]) => `${k}: ${v}ms`).join('\n') : 'No navigation timing data.';
  },

  // Visual
  async screenshot(args) {
    const path = args[0] || '/tmp/verdict-screenshot.png';
    const sel = args.find(a => a.startsWith('@e') || (a.startsWith('.') || a.startsWith('#')) && a !== path);
    if (sel && !sel.startsWith('--')) { await (await resolveRef(sel)).screenshot({ path, timeout: 5000 }); }
    else { await page.screenshot({ path, fullPage: args.includes('--full') }); }
    return `Screenshot saved to ${path}`;
  },
  async viewport(args) {
    const s = args[0]; if (!s || !s.includes('x')) return 'Error: size required (e.g., 375x812)';
    const [w, h] = s.split('x').map(Number); await page.setViewportSize({ width: w, height: h });
    return `Viewport set to ${w}x${h}`;
  },
  async responsive(args) {
    const dir = args[0] || '/tmp';
    const presets = [{ name: 'mobile', width: 375, height: 812 }, { name: 'tablet', width: 768, height: 1024 }, { name: 'desktop', width: 1280, height: 720 }];
    const orig = page.viewportSize();
    const results = [];
    for (const { name, width, height } of presets) {
      await page.setViewportSize({ width, height });
      const file = `${dir}/verdict-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      results.push(`${name} (${width}x${height}): ${file}`);
    }
    await page.setViewportSize(orig);
    return results.join('\n');
  },
  async style(args) {
    if (args[0] === '--undo') {
      if (!styleHistory.length) return 'Nothing to undo.';
      const entry = styleHistory.pop();
      const el = await (await resolveRef(entry.ref)).elementHandle();
      await el.evaluate((e, { p, v }) => e.style.setProperty(p, v), { p: entry.prop, v: entry.oldValue });
      return `Undone: ${entry.ref} ${entry.prop} restored to "${entry.oldValue}"`;
    }
    if (args[0] === '--history') return styleHistory.length ? styleHistory.map((h, i) => `${i + 1}. ${h.ref} ${h.prop}: ${h.oldValue} -> ${h.newValue}`).join('\n') : 'No style changes.';
    const ref = args[0], prop = args[1], value = args.slice(2).join(' ');
    if (!ref || !prop || !value) return 'Error: ref, property, and value required';
    const el = await (await resolveRef(ref)).elementHandle();
    const oldValue = await el.evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop);
    await el.evaluate((e, { p, v }) => e.style.setProperty(p, v), { p: prop, v: value });
    styleHistory.push({ ref, prop, oldValue, newValue: value });
    return `Set ${ref} ${prop}: ${value} (was: ${oldValue})`;
  },

  // Auth Profiles
  async 'auth-save'(args) {
    const name = args[0]; if (!name) return 'Error: profile name required';
    const cookies = await context.cookies();
    const storage = await page.evaluate(() => {
      const ls = {}, ss = {};
      for (let i = 0; i < localStorage.length; i++) ls[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
      for (let i = 0; i < sessionStorage.length; i++) ss[sessionStorage.key(i)] = sessionStorage.getItem(sessionStorage.key(i));
      return { localStorage: ls, sessionStorage: ss };
    });
    writeFileSync(profilePath(name), encryptData({ cookies, storage, url: page.url(), savedAt: new Date().toISOString() }), { mode: 0o600 });
    return `Profile "${name}" saved (${cookies.length} cookies, URL: ${page.url()})`;
  },
  async 'auth-load'(args) {
    const name = args[0]; if (!name) return 'Error: profile name required';
    const p = profilePath(name);
    if (!existsSync(p)) return `Error: profile "${name}" not found. Use auth-list to see available.`;
    try {
      const profile = decryptData(readFileSync(p, 'utf8'));
      await context.clearCookies();
      if (profile.cookies.length) await context.addCookies(profile.cookies);
      if (profile.url) {
        await page.goto(profile.url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.evaluate((s) => {
          for (const [k, v] of Object.entries(s.localStorage || {})) localStorage.setItem(k, v);
          for (const [k, v] of Object.entries(s.sessionStorage || {})) sessionStorage.setItem(k, v);
        }, profile.storage);
      }
      return `Profile "${name}" loaded (${profile.cookies.length} cookies, saved: ${profile.savedAt})`;
    } catch (e) { return `Error loading profile: ${e.message}`; }
  },
  async 'auth-list'() {
    const { readdirSync } = await import('node:fs');
    try {
      const files = readdirSync(AUTH_DIR).filter(f => f.endsWith('.enc'));
      if (!files.length) return 'No saved profiles. Use auth-save <name> after logging in.';
      return files.map(f => {
        const name = f.replace('.enc', '');
        try { const p = decryptData(readFileSync(resolve(AUTH_DIR, f), 'utf8')); return `${name}: ${p.cookies.length} cookies, saved ${Math.round((Date.now() - new Date(p.savedAt).getTime()) / 3600000)}h ago`; }
        catch { return `${name}: (corrupted or wrong machine)`; }
      }).join('\n');
    } catch { return 'No saved profiles.'; }
  },
  async 'auth-delete'(args) {
    const name = args[0]; if (!name) return 'Error: profile name required';
    const p = profilePath(name); if (!existsSync(p)) return `Profile "${name}" not found.`;
    unlinkSync(p); return `Profile "${name}" deleted.`;
  },
  async 'storage-state-load'(args) {
    const filePath = args[0]; if (!filePath) return 'Error: path required. Usage: storage-state-load <path>';
    if (!existsSync(filePath)) return `Error: file not found: ${filePath}`;
    try {
      const state = JSON.parse(readFileSync(filePath, 'utf8'));
      await context.clearCookies();
      if (state.cookies?.length) await context.addCookies(state.cookies);
      const origins = state.origins || [];
      for (const { origin, localStorage: items } of origins) {
        if (!items?.length) continue;
        await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.evaluate((ls) => { for (const { name, value } of ls) localStorage.setItem(name, value); }, items);
      }
      return `Loaded storageState from ${filePath}: ${state.cookies?.length || 0} cookies, ${origins.length} origin(s)`;
    } catch (e) { return `Error loading storageState: ${e.message}`; }
  },
  async handoff() {
    const cookies = await context.cookies();
    const currentUrl = page.url();
    await browser.close();
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();
    if (cookies.length) await context.addCookies(cookies);
    if (currentUrl && currentUrl !== 'about:blank') await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    return `Switched to headed mode. Browser visible.\nURL: ${page.url()}\nComplete manual work, then run: resume`;
  },
  async resume() {
    const cookies = await context.cookies();
    const currentUrl = page.url();
    const storage = await page.evaluate(() => { const ls = {}; for (let i = 0; i < localStorage.length; i++) ls[localStorage.key(i)] = localStorage.getItem(localStorage.key(i)); return { localStorage: ls }; });
    await browser.close();
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
    if (cookies.length) await context.addCookies(cookies);
    if (currentUrl && currentUrl !== 'about:blank') { await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); await page.evaluate((s) => { for (const [k, v] of Object.entries(s.localStorage || {})) localStorage.setItem(k, v); }, storage); }
    page.on('console', msg => { consoleMessages.push(`[${msg.type()}] ${msg.text()}`); if (consoleMessages.length > 50) consoleMessages.shift(); });
    page.on('response', r => { networkRequests.push({ method: r.request().method(), status: r.status(), url: r.url().slice(0, 120) }); if (networkRequests.length > 50) networkRequests.shift(); });
    return `Resumed headless mode.\nURL: ${page.url()}\nCookies: ${cookies.length}\nUse auth-save <name> to persist.`;
  },
  async 'goto-auth'(args) {
    const pi = args.indexOf('--profile');
    let profileName = null;
    const clean = [...args];
    if (pi !== -1) { profileName = args[pi + 1]; clean.splice(pi, 2); }
    const url = clean[0]; if (!url) return 'Error: URL required';
    if (profileName) { const r = await commands['auth-load']([profileName]); if (r.startsWith('Error')) return r; }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    const finalUrl = page.url();
    if (finalUrl.includes('/login') || finalUrl.includes('/oauth') || finalUrl.includes('sso.'))
      return `Redirected to login: ${finalUrl}\nSession expired. Run: handoff -> login manually -> resume -> auth-save ${profileName || 'default'}`;
    return `Navigated to ${finalUrl}${profileName ? ` (profile: ${profileName})` : ''}`;
  },

  // Cookies
  async cookies(args) {
    const c = await context.cookies(args[0] || page.url());
    return c.map(c => `${c.name}=${c.value.slice(0, 30)}${c.value.length > 30 ? '...' : ''} (${c.domain})`).join('\n') || 'No cookies.';
  },
  async 'cookie-set'(args) {
    const [name, value, domain] = args; if (!name || !value || !domain) return 'Error: name, value, domain required';
    await context.addCookies([{ name, value, domain, path: '/' }]);
    return `Cookie set: ${name}=${value.slice(0, 20)}... on ${domain}`;
  },
  async 'cookie-import'(args) {
    const domain = args[0]; if (!domain) return 'Error: domain required';
    const cookieDb = resolve(process.env.HOME, process.platform === 'darwin' ? 'Library/Application Support/Google/Chrome/Default/Cookies' : '.config/google-chrome/Default/Cookies');
    if (!existsSync(cookieDb)) return `Chrome cookie DB not found at ${cookieDb}`;
    const tmp = '/tmp/verdict-cookies-copy';
    copyFileSync(cookieDb, tmp);
    try {
      const raw = execSync(`sqlite3 -json "${tmp}" "SELECT name, value, host_key, path, is_secure, is_httponly FROM cookies WHERE host_key LIKE '%${domain}%'"`, { encoding: 'utf8', timeout: 5000 });
      const rows = JSON.parse(raw || '[]');
      const cookies = rows.map(r => ({ name: r.name, value: r.value, domain: r.host_key, path: r.path || '/', secure: !!r.is_secure, httpOnly: !!r.is_httponly })).filter(c => c.value);
      if (!cookies.length) return `No unencrypted cookies for ${domain}. Chrome 80+ encrypts cookies.`;
      await context.addCookies(cookies);
      return `Imported ${cookies.length} cookies for ${domain}`;
    } catch (e) { return `Cookie import failed: ${e.message}`; }
    finally { try { unlinkSync(tmp); } catch {} }
  },

  // Tabs
  async tabs() { return context.pages().map((p, i) => `${i}: ${p.url()}${p === page ? ' (active)' : ''}`).join('\n'); },
  async newtab(args) { const np = await context.newPage(); await np.goto(args[0] || 'about:blank', { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}); page = np; return `New tab: ${page.url()}`; },
  async tab(args) { const i = parseInt(args[0]), ps = context.pages(); if (isNaN(i) || i < 0 || i >= ps.length) return `Invalid tab. ${ps.length} open.`; page = ps[i]; return `Tab ${i}: ${page.url()}`; },
  async closetab() { if (context.pages().length <= 1) return 'Cannot close last tab.'; await page.close(); page = context.pages()[0]; return `Closed. Active: ${page.url()}`; },

  // Frames
  async frame(args) {
    if (!args[0]) return page.frames().map((f, i) => `${i}: ${f.url()}`).join('\n');
    const el = await page.locator(args[0]).elementHandle();
    const fr = await el.contentFrame();
    if (!fr) return `No frame for ${args[0]}`;
    page._mainPage = page._mainPage || page;
    page = fr;
    return `Frame: ${args[0]} (${fr.url()})`;
  },
  async 'frame-exit'() { if (page._mainPage) { page = page._mainPage; return 'Main frame.'; } return 'Already main.'; },

  // Advanced
  async diff(args) {
    const [u1, u2] = args; if (!u1 || !u2) return 'Error: two URLs required';
    await page.goto(u1, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const t1 = (await page.locator('body').innerText({ timeout: 5000 })).split('\n').slice(0, 200);
    await page.goto(u2, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const t2 = (await page.locator('body').innerText({ timeout: 5000 })).split('\n').slice(0, 200);
    const added = t2.filter(l => !t1.includes(l)).map(l => `+ ${l}`).slice(0, 30);
    const removed = t1.filter(l => !t2.includes(l)).map(l => `- ${l}`).slice(0, 30);
    return (!added.length && !removed.length) ? 'Pages identical.' : `--- ${u1}\n+++ ${u2}\n${removed.join('\n')}\n${added.join('\n')}`;
  },
  async chain(args) {
    let cmds; try { cmds = JSON.parse(args.join(' ')); } catch { return 'Error: invalid JSON. Use: [["goto","url"],["snapshot","-i"]]'; }
    const results = [];
    for (const [cmd, ...a] of cmds) {
      const h = commands[cmd]; if (!h) { results.push(`${cmd}: unknown`); continue; }
      try { results.push(`${cmd}: ${await h(a)}`); } catch (e) { results.push(`${cmd}: Error: ${e.message}`); }
    }
    return results.join('\n---\n');
  },
  async status() { return `URL: ${page.url()}\nTitle: ${await page.title()}\nRefs: ${refs.size}\nViewport: ${page.viewportSize().width}x${page.viewportSize().height}`; },
  async stop() { await shutdown(); return 'Stopped'; }
};

// Console & network collectors
const consoleMessages = [];
const networkRequests = [];
page.on('console', msg => { consoleMessages.push(`[${msg.type()}] ${msg.text()}`); if (consoleMessages.length > 50) consoleMessages.shift(); });
page.on('response', r => { networkRequests.push({ method: r.request().method(), status: r.status(), url: r.url().slice(0, 120) }); if (networkRequests.length > 50) networkRequests.shift(); });

// HTTP server
const port = parseInt(process.env.VERDICT_PORT) || (10000 + Math.floor(Math.random() * 50000));
const token = crypto.randomUUID();
const server = createServer(async (req, res) => {
  resetIdle();
  if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); res.end('Unauthorized'); return; }
  let body = ''; for await (const chunk of req) body += chunk;
  try {
    const { command, args = [] } = JSON.parse(body);
    const handler = commands[command];
    if (!handler) { res.writeHead(400); res.end(`Unknown: ${command}. Available: ${Object.keys(commands).join(', ')}`); return; }
    const result = await handler(args);
    res.writeHead(200); res.end(result);
  } catch (e) {
    if (!res.headersSent) { res.writeHead(500); }
    res.end(`Error: ${e.message}`);
  }
});
server.listen(port, '127.0.0.1', () => {
  writeFileSync(STATE_FILE, JSON.stringify({ port, token, pid: process.pid, started: new Date().toISOString() }), { mode: 0o600 });
  console.log(`Verdict server on port ${port} (PID ${process.pid})`);
  resetIdle();
});
