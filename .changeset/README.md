# Changesets

Every pull request that changes a public package must include a Changeset:

```bash
bun run changeset
```

Choose each affected package and the correct semantic version bump. Documentation-only,
repository-maintenance, and private-package changes do not require one.

The Steam and Cfx.re packages are public packages. Their first release is handled by the release
workflow when the package is missing from npm; later changes use the normal Changesets flow.
