# Changesets

Every pull request that changes a public package must include a Changeset:

```bash
bun run changeset
```

Choose each affected package and the correct semantic version bump. Documentation-only,
repository-maintenance, and private-package changes do not require one.

Steam and Cfx.re remain private scaffolds and are ignored until their provider implementations are
ready. Remove `private: true`, choose an initial non-zero version, and add a Changeset in the same
pull request that makes a plugin publishable.
