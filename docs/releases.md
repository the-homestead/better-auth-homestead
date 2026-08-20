# Release guide

## Normal release flow

1. Every public package change includes a Changeset.
2. Merging to `main` runs CI and the release workflow.
3. Changesets opens or updates a `chore: release packages` pull request.
4. Review the versions and generated changelogs, then merge the release pull request.
5. The next release workflow publishes the changed packages to npm with provenance.

Versions are independent. A Steam release does not change the Cfx.re package unless both have
Changesets.

## npm trusted publishing

After a package exists on npm, configure GitHub trusted publishing for:

- Repository: `the-homestead/better-auth-homestead`
- Workflow: `release.yml`
- Package: the exact `@homestead-systems/ba-*` name

The workflow grants `id-token: write` only to the release job and installs npm 11.15 or newer. The
optional `NPM_TOKEN` repository secret bootstraps a package's first release or acts as a fallback.
Remove that secret after every package used by the workflow has trusted publishing configured if a
token fallback is no longer wanted.

## First package release

An unpublished npm package cannot always have trust configured in advance. Create a granular npm
token limited to the intended package scope and store it as the `NPM_TOKEN` Actions secret. The
release workflow publishes missing public packages from Ubuntu with provenance, after which you can
configure npm trusted publishing for each package and remove or rotate the bootstrap token.

## Manual fallback

From a clean local `main` branch with npm authentication configured:

```bash
bun run publish:manual
```

The guard rejects other branches and dirty working trees, runs the complete validation pipeline,
checks the active npm identity, and only then invokes `changeset publish`. It never versions packages;
run `bun run version-packages` and review those changes first when handling a release manually. On
Windows, npm cannot generate provenance locally; use the GitHub Actions workflow for any publication
that must carry npm provenance.
