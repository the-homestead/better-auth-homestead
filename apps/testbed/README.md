# Homestead Better Auth Testbed

This private TanStack Start application installs every Homestead Better Auth server and client plugin
in one real consumer. It verifies the combined database schema, API routes, provider callbacks, React
client, cookies, and browser behavior without contacting Steam, CFX, or Tebex.

The testbed is development infrastructure. It is not published and is not a production starter.

## Included plugins

- `@homestead/ba-steam` and its client plugin
- `@homestead/ba-cfx` and its client plugin
- `@homestead/ba-tebex` and its client plugin
- Better Auth email/password authentication for deterministic player sessions
- Better Auth `testUtils` in the in-process integration harness

All integration tests run real Better Auth migrations against an isolated Bun SQLite database. Browser
tests use a temporary file-backed database because the TanStack server is a separate process.

## Setup

Install dependencies from the repository root:

```bash
bun install
bunx playwright install chromium
```

Chromium only needs to be installed once per Playwright version. GitHub Actions installs Chromium and
its Linux system dependencies automatically.

## Commands

Run commands from the repository root:

```bash
bun run test:integration # Better Auth plus all provider flows under Bun
bun run test:react       # React Testing Library under Happy DOM
bun run test:e2e         # TanStack Start plus Playwright Chromium
bun run test:all         # Every Bun and browser test layer
bun run testbed:dev      # Interactive TanStack Start application
bun run validate         # Complete repository and browser validation
```

To run this workspace directly:

```bash
cd apps/testbed
bun run test
bun run test:e2e
bun run dev
```

## Test layers

### Integration

`tests/integration` runs with `bun:test`. `test-support/test-auth.ts` creates a complete Better Auth
instance using an isolated in-memory Bun SQLite database, runs all migrations, and exposes the official
Better Auth test utilities.

The suite verifies:

- all plugin IDs are mounted once
- the combined schema migrates
- session cookies and authenticated requests work
- Steam OpenID initiation, verification, profile loading, and sign-in
- CFX key initiation, encrypted callback payload, profile loading, and sign-in
- Tebex catalog reads, checkout creation, and signed webhook validation
- local provider requests use published plugin behavior

### React

`tests/react` uses React Testing Library with Happy DOM registered by `test-support/dom.ts`. Put
component behavior here when a real browser is unnecessary. The preload gives Better Auth a real local
URL and browser globals.

### Browser E2E

`tests/e2e` uses Playwright. Its configuration starts two managed processes:

1. the deterministic provider mock server on port `43112`
2. the TanStack Start application on port `3000`

The browser creates a user through the rendered React form, validates the session cookie, calls each
mounted plugin, and signs out. Failures retain a screenshot, trace, error context, and HTML report under
ignored test-artifact directories.

## Provider mocks

`test-support/provider-mocks/server.ts` provides local contracts for all providers:

| Provider | Mocked behavior                                                            |
| -------- | -------------------------------------------------------------------------- |
| Steam    | OpenID assertion verification and player summaries                         |
| CFX      | current user, profile email fallback, and key revocation                   |
| Tebex    | store, categories, packages, baskets, checkout links, and webhook fixtures |

The server binds only to `localhost`, uses an ephemeral port in Bun integration tests, and uses port
`43112` under Playwright. Tests receive the generated URLs from the mock server instead of hardcoding
production hosts.

Never add live credentials or fallback calls to real provider hosts. Add another deterministic route or
scenario to the local mock instead.

## Environment

Copy `.env.example` only for interactive development. The checked-in values point to local mocks and
contain no usable provider credentials. Playwright supplies its own isolated environment.

Start the provider mocks and application in separate terminals for manual use:

```bash
cd apps/testbed
bun run provider:mock
```

```bash
cd apps/testbed
bun run dev
```

Runtime databases are written beneath `.data/` and ignored by Git. Delete a local database when you
want a clean manual environment; automated suites always allocate isolated state.

## Adding a plugin

1. Add the workspace dependency to this package.
2. Add its server plugin to `test-support/plugins.ts`.
3. Add its client plugin to `src/auth/auth-client.ts` when one exists.
4. Add Vite source aliases for the package entrypoints.
5. Add a deterministic external-provider mock when required.
6. Add a migration/install assertion and principal success and rejection flows under
   `tests/integration`.
7. Add React or Playwright coverage only for browser-visible behavior.
8. Update the installed-plugin list in this README and the dashboard.

Tests import public package entrypoints. Vite aliases those entrypoints to workspace source so a clean
clone can run the testbed before package artifacts exist. Package export maps are validated separately
by the repository package checker.

## Debugging

Run one Bun file or test name:

```bash
bun test apps/testbed/tests/integration/provider-flows.test.ts
bun test apps/testbed/tests/integration/provider-flows.test.ts -t "Steam"
```

Run Playwright visibly or open its trace:

```bash
cd apps/testbed
bunx playwright test --headed
bunx playwright show-trace test-results/<test>/trace.zip
```

If Playwright cannot start, verify Chromium is installed. If a provider request returns `404`, the mock
response includes the unmatched method and path. If the app cannot migrate, remove only the ignored
`apps/testbed/.data` directory and rerun the command.
