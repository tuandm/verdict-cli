// The two manifests must agree. Checked here rather than only in the release workflow so
// the drift is caught on the PR that introduces it, when the fix is one line, instead of
// on a tag push where the fix is a deleted tag and a re-release.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

test('plugin.json version matches package.json', () => {
  assert.equal(read('.claude-plugin/plugin.json').version, read('package.json').version);
});
