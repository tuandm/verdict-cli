// Shared rig for the CLI integration tests.
//
// Every test runs the real bin/browse.mjs in a child process against its own
// VERDICT_DATA_DIR, so a developer's own running daemon is never seen, stopped or
// corrupted by the suite. That isolation is the reason these can be integration tests at
// all rather than unit tests around a mock.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CLI = resolve(HERE, '..', 'bin', 'browse.mjs');

export function makeDataDir() {
  return mkdtempSync(join(tmpdir(), 'verdict-test-'));
}

export function cleanup(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}

export const stateFile = dir => join(dir, 'verdict.json');
export const hasState = dir => existsSync(stateFile(dir));

/** Write a verdict.json by hand, to put the CLI into a specific starting condition. */
export function writeState(dir, { pid = process.pid, port, token = 'test-token' }) {
  writeFileSync(stateFile(dir), JSON.stringify({
    pid, port, token, started: new Date().toISOString(),
  }));
}

/** A port with nothing listening on it, so a connection attempt is refused. */
export async function closedPort() {
  const srv = createServer();
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  await new Promise(r => srv.close(r));
  return port;
}

/** Run the CLI to completion. Never rejects - the exit code is part of what is asserted. */
export function run(dataDir, args, { timeoutMs = 60_000 } = {}) {
  return new Promise(resolveRun => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, VERDICT_DATA_DIR: dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', code => {
      clearTimeout(timer);
      resolveRun({ code, stdout, stderr });
    });
  });
}

/** True when Chromium and playwright are actually installed, so browser tests can run. */
export async function browserAvailable() {
  try {
    const { chromium } = await import('playwright');
    return typeof chromium?.launch === 'function';
  } catch { return false; }
}
