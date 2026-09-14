// Copies package.json's version into .claude-plugin/plugin.json.
//
// Two manifests describe the same artifact and only one of them is a package.json, so
// `npm version` moves one and leaves the other behind - which is how the plugin manifest
// came to read 0.1.0 against a published 0.1.1. Wired as the `version` npm lifecycle
// script, this runs after the bump and before the commit, and the `git add` puts the
// manifest in the same commit as package.json rather than a follow-up nobody makes.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = resolve(ROOT, '.claude-plugin', 'plugin.json');

const { version } = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const raw = readFileSync(MANIFEST, 'utf8');

// A textual replace of the one line, not JSON.stringify of a parsed object: the manifest
// is hand-maintained and keeps its keyword lines packed several to a row. Reserialising
// would reformat the whole file and bury the version change in the diff.
const next = raw.replace(/("version"\s*:\s*")[^"]*(")/, `$1${version}$2`);
if (next === raw && !raw.includes(`"version": "${version}"`)) {
  throw new Error(`no version field found in ${MANIFEST}`);
}

writeFileSync(MANIFEST, next);
execFileSync('git', ['add', MANIFEST], { cwd: ROOT, stdio: 'inherit' });
console.log(`plugin.json version -> ${version}`);
