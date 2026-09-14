# Releasing

Cutting a release is two commands. Everything after the tag push is automated by
`.github/workflows/release.yml`.

```bash
git checkout main && git pull
npm version patch          # or minor / major
git push origin main --follow-tags
```

`npm version` bumps `package.json`, runs the `version` script to copy the new number into
`.claude-plugin/plugin.json`, commits both, and creates the `vX.Y.Z` tag. The tag push
starts the release workflow.

## What the workflow does

1. **verify** - refuses the tag unless it is an ancestor of `main` (so the code went
   through PR CI), unless `package.json` matches the tag, and unless the plugin manifest
   matches `package.json`. Then it runs the full suite on real Chromium and prints
   `npm pack --dry-run` so the tarball contents are visible before they are permanent.
2. **publish** - `npm publish --provenance`. Skipped when that version is already on the
   registry, so a rerun after a flake is safe.
3. **github-release** - creates the release page with notes generated from the merged
   PRs. Runs even when publish was skipped.

A failure in **verify** costs a deleted tag:

```bash
git tag -d v0.2.0 && git push origin :refs/tags/v0.2.0
```

Once **publish** has succeeded the version number is spent - npm does not allow
re-publishing one. Fix forward with the next patch.

## One-time setup

The workflow publishes with npm **trusted publishing** (OIDC), so this repo stores no npm
token. Before the first release, a package maintainer must register the publisher on
npmjs.com:

- Package `verdict-cli` → Settings → Trusted publisher
- Organization/user `tuandm`, repository `verdict-cli`
- Workflow filename `release.yml`, environment blank

Until that exists the publish step fails authentication. Nothing else in the repo needs a
secret.

## Versioning

Semver against the CLI's observable surface: command names, flags, output shape, and the
`VERDICT_*` environment variables. Agents parse this output, so a changed field name is a
break even when no code signature moved.

- **patch** - fixes that leave the surface alone
- **minor** - new commands or flags
- **major** - a removed or renamed command, flag, output field, or env var

## Backfilling tags for 0.1.0 and 0.1.1

Both are on npm but neither has a git tag, so neither has a release page. A tag push runs
the workflow that exists **at the tagged commit**, and neither of those commits contains
one, so backfilled tags do nothing - they are safe, and they also publish nothing. Create
those pages by hand if you want them:

```bash
gh release create v0.1.1 --target 883f5bb --generate-notes
```
