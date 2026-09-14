// `stop` must exit cleanly, and must only claim success when the server is really gone.
//
// These need no browser: each one puts the CLI into a known starting condition by writing
// verdict.json by hand, so they are fast and deterministic and run in a bare clone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, makeDataDir, cleanup, writeState, hasState, closedPort } from './helpers.mjs';

// The regression this whole file exists for: `stop` used to fall into the reconnect
// branch, start a replacement server, retry, and throw again from inside the catch where
// nothing handled it - so the CLI died with an uncaught 'fetch failed' and a stack trace.
const assertCleanExit = r => {
  assert.equal(r.code, 0, `expected exit 0, got ${r.code}\nstderr: ${r.stderr}`);
  assert.doesNotMatch(r.stderr, /fetch failed/i, 'uncaught fetch failure reached stderr');
  assert.doesNotMatch(r.stderr, /at .*browse\.mjs/, 'a stack trace reached stderr');
};

test('stop with no server running exits 0 and reports success', async () => {
  const dir = makeDataDir();
  try {
    const r = await run(dir, ['stop']);
    assertCleanExit(r);
    assert.match(r.stdout, /Server stopped\./);
  } finally { cleanup(dir); }
});

test('stop clears a stale record whose pid is dead', async () => {
  const dir = makeDataDir();
  try {
    // pid 2^22 is above the default pid_max on Linux and macOS, so it cannot be live.
    writeState(dir, { pid: 4194304, port: await closedPort() });
    const r = await run(dir, ['stop']);
    assertCleanExit(r);
    assert.equal(hasState(dir), false, 'stale verdict.json survived stop');
  } finally { cleanup(dir); }
});

test('stop removes the record when the port refuses connections', async () => {
  const dir = makeDataDir();
  try {
    // A live pid with nothing listening: the CLI gets ECONNREFUSED rather than a clean
    // shutdown. Without the unlink on this path a recycled pid would keep passing
    // isAlive and point every later command at a dead port.
    writeState(dir, { pid: process.pid, port: await closedPort() });
    const r = await run(dir, ['stop']);
    assertCleanExit(r);
    assert.match(r.stdout, /Server stopped\./);
    assert.equal(hasState(dir), false, 'verdict.json survived a refused connection');
  } finally { cleanup(dir); }
});

test('stop is idempotent', async () => {
  const dir = makeDataDir();
  try {
    const first = await run(dir, ['stop']);
    const second = await run(dir, ['stop']);
    assertCleanExit(first);
    assertCleanExit(second);
    assert.match(second.stdout, /Server stopped\./);
  } finally { cleanup(dir); }
});
