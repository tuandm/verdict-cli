// The reconnect branch: a record that looks live but answers nothing must lead to a
// restart, a reload of any --storage-state, and then the command - not a throw.
//
// These launch real Chromium, so they are skipped in a clone where playwright is not
// installed rather than failing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, makeDataDir, cleanup, writeState, hasState, closedPort, browserAvailable } from './helpers.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Resolved at module load, not in a before() hook: node:test reads `skip` when the test is
// registered, and any function passed there is simply truthy - which would skip every one
// of these silently, forever.
const skip = (await browserAvailable()) ? false : 'playwright/chromium not installed';

test('a live pid with a dead port restarts and still runs the command', { skip }, async () => {
  const dir = makeDataDir();
  try {
    writeState(dir, { pid: process.pid, port: await closedPort() });
    const r = await run(dir, ['title']);
    assert.equal(r.code, 0, `expected exit 0, got ${r.code}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /Server down, restarting/);
  } finally { await run(dir, ['stop']); cleanup(dir); }
});

test('the restart reloads --storage-state before running the command', { skip }, async () => {
  const dir = makeDataDir();
  try {
    const ss = join(dir, 'storage-state.json');
    writeFileSync(ss, JSON.stringify({ cookies: [], origins: [] }));
    writeState(dir, { pid: process.pid, port: await closedPort() });

    // Ordering is the point. --storage-state must be reapplied to the replacement server
    // BEFORE the command runs, or the command sees a browser with no session. Upstream
    // added this reload on the restart path; it has to survive inside the retry guard.
    const r = await run(dir, ['--storage-state', ss, 'title']);
    assert.equal(r.code, 0, `expected exit 0, got ${r.code}\nstderr: ${r.stderr}`);
    assert.match(r.stderr, /Server down, restarting/);
    assert.match(r.stderr, /Loaded storageState/);
    assert.ok(
      r.stderr.indexOf('Server down, restarting') < r.stderr.indexOf('Loaded storageState'),
      'storage state was not reloaded on the restart path',
    );
  } finally { await run(dir, ['stop']); cleanup(dir); }
});

test('stop against a live server exits 0 and removes the record', { skip }, async () => {
  const dir = makeDataDir();
  try {
    const started = await run(dir, ['goto', 'about:blank']);
    assert.equal(started.code, 0, `could not start a server\nstderr: ${started.stderr}`);
    assert.equal(hasState(dir), true, 'no verdict.json after starting');

    // A successful shutdown closes the socket while the response is in flight, so this is
    // the path that used to surface as an uncaught 'fetch failed'.
    const r = await run(dir, ['stop']);
    assert.equal(r.code, 0, `expected exit 0, got ${r.code}\nstderr: ${r.stderr}`);
    assert.match(r.stdout, /Server stopped\./);
    assert.doesNotMatch(r.stderr, /fetch failed/i);
    assert.equal(hasState(dir), false, 'verdict.json survived a real stop');
  } finally { await run(dir, ['stop']); cleanup(dir); }
});
