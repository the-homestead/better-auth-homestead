# Plugin authoring

## Create a workspace

Run the generator with a lowercase kebab-case provider name:

```bash
bun run plugin:create twitch
```

This creates `packages/twitch` with the final package name
`@homestead/ba-twitch`. The new package remains private until it has complete behavior,
documentation, and tests.

## Implement the plugin

Keep the package API narrow and use named exports. A server plugin returns an object satisfying
Better Auth's `BetterAuthPlugin` type and must have a stable, unique `id`. Add a separate client entry
point only when the browser client needs behavior or inferred endpoints.

Provider credentials belong in consumer configuration. Never embed client secrets, test-account
credentials, or live tokens in source or fixtures.

## Test the plugin

Use `createPluginTestInstance()` from the private plugin-kit workspace. It combines Better Auth's
official `testUtils()` plugin with Bun's in-memory SQLite database and runs the real schema migrations.

Mock provider HTTP calls at the network boundary. Cover successful callbacks, rejected callbacks,
missing stable identifiers, malformed profiles, account linking, and provider-specific errors.

Every provider plugin must also be installed in the private TanStack Start testbed. Add combined-schema
coverage, a mocked provider success flow, a provider rejection path, and browser coverage when the
plugin exposes browser-visible behavior. See [`apps/testbed/README.md`](../apps/testbed/README.md).

## Prepare publication

Before a first release:

1. Replace the scaffold warning with complete installation, configuration, API, and provider setup
   instructions.
2. Set a non-zero initial version and remove `private: true`.
3. Confirm package metadata, peer dependency range, export map, and file allowlist.
4. Run `bun run validate` and inspect `bun pm pack --dry-run` from the package directory.
5. Add a Changeset for the first release.
