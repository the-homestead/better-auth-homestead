# TanStack Start Plugin Testbed Design

**Status:** Approved direction; pending implementation plan  
**Application:** `apps/testbed`  
**Test runner:** Bun, with Playwright for browser automation

## Summary

Create a private TanStack Start and React application inside the monorepo that consumes every
Homestead Better Auth plugin exactly as a real application would. The testbed will exercise the server
plugins, client plugins, database schemas, browser flows, and cross-plugin behavior from one Better Auth
instance.

Provider integrations will run against deterministic local HTTP mocks. Tests will never require live
Steam, CFX, or Tebex credentials, make requests to production providers, or depend on shared external
state. Bun remains the package manager, script runner, unit-test runner, and integration-test runner.
Playwright will provide browser automation and will be invoked through Bun scripts.

The testbed is a development and CI fixture, not a published package or production application.

## Goals

- Verify every Homestead plugin can be installed in the same Better Auth instance.
- Exercise package entrypoints rather than importing package internals.
- Run Better Auth migrations for the complete combined plugin schema.
- Cover server endpoints, client inference, authentication, callbacks, account linking, billing, and
  webhook behavior.
- Provide a small React interface for browser-visible authentication and plugin states.
- Mock provider HTTP APIs at their network boundaries with deterministic fixtures.
- Make local and CI execution reproducible without provider accounts or credentials.
- Give future plugins one documented place to add integration and E2E coverage.
- Keep the complete repository validation command suitable for pull-request gating.

## Non-goals

- Building a production Homestead website or admin dashboard.
- Duplicating every package-level unit test in the browser.
- Testing Steam, CFX, or Tebex availability.
- Keeping a persistent development database or production-like seed data.
- Supporting multiple frontend frameworks.
- Shipping the testbed or its mock credentials to npm.
- Using browser tests as the only validation layer.
- Testing future plugins before they exist in the repository.

## Approaches Considered

### Selected: real consumer testbed with layered tests

Create a TanStack Start application that imports the public exports of all workspace plugins. Use Bun
for unit and integration tests, then run browser flows against the built or development application
with Playwright.

This catches integration failures that isolated package tests cannot detect: schema collisions,
endpoint conflicts, client-plugin inference problems, cookie behavior, route mounting, and browser
redirect handling.

### Rejected: package-local tests plus a documentation example

This is simpler, but it does not prove that all plugins work together. Documentation examples also
tend to drift because they are not executed through a real framework.

### Deferred: containerized production topology

Running separate application, database, provider-mock, and browser containers would more closely model
deployment. It adds substantial startup time and CI complexity without improving the core plugin
contracts enough to justify it now. The provider mocks and database interfaces will remain separable so
containers can be introduced later.

## Workspace Layout

```text
apps/
└── testbed/
    ├── src/
    │   ├── auth/
    │   │   ├── auth.ts
    │   │   ├── auth-client.ts
    │   │   └── plugin-options.ts
    │   ├── components/
    │   ├── routes/
    │   │   ├── __root.tsx
    │   │   ├── index.tsx
    │   │   └── api/auth/$.ts
    │   ├── router.tsx
    │   ├── routeTree.gen.ts
    │   └── styles.css
    ├── test-support/
    │   ├── fixtures/
    │   ├── provider-mocks/
    │   ├── database.ts
    │   ├── test-auth.ts
    │   └── test-server.ts
    ├── tests/
    │   ├── integration/
    │   ├── react/
    │   └── e2e/
    ├── README.md
    ├── bunfig.toml
    ├── package.json
    ├── playwright.config.ts
    ├── tsconfig.json
    └── vite.config.ts
```

The root workspace pattern will include both `packages/*` and `apps/*`. The testbed package will be
private and will depend on the Homestead plugins through `workspace:*`.

## Application Boundary

The application exists only to prove consumer behavior. Its UI will remain deliberately small:

- authentication status and session details
- email/password sign-up and sign-in controls
- Steam and CFX connection controls
- linked-account status
- Tebex catalog, checkout, billing, and entitlement test controls
- visible success and safe error states for browser assertions

The UI will not become a general plugin showcase. Each screen must exist because a browser-visible
contract needs testing.

TanStack Start will mount Better Auth through a catch-all `/api/auth/$` server route. Both `GET` and
`POST` handlers will forward the original `Request` to `auth.handler`. The browser client will use each
plugin's published client entrypoint.

## Better Auth Configuration

The testbed server instance will configure:

- email and password authentication
- Better Auth `testUtils` only when the test environment is active
- `@itzdabbzz/better-auth-cfx`
- `@itzdabbzz/better-auth-steam`
- `@itzdabbzz/better-auth-tebex`

Client configuration will install the matching CFX, Steam, and Tebex client plugins. Tests must import
from package roots or documented subpath exports. They must not reach into another package's `src`
directory.

Plugin credentials and provider URLs will come from a typed test configuration module. Fake credential
values are permitted only for local mocks. The configuration module will reject missing values outside
test mode and will prevent mock-only options from being enabled accidentally in production mode.

## Database Strategy

Integration tests will create an isolated Bun SQLite database and run Better Auth migrations against
the combined plugin configuration. Each test file or worker receives a unique temporary database.
Teardown closes the connection and removes its temporary files.

The default integration path will use in-memory SQLite when the application and test execute in one
process. Browser E2E tests will use a temporary file-backed SQLite database because the test runner and
application server are separate processes.

No database file will be committed. Tests cannot share state across suites or rely on execution order.

## Provider Mocks

Each external provider receives a dedicated mock server module with explicit scenario controls.

### Steam

- OpenID discovery and authentication redirects
- valid callback assertions
- rejected or malformed assertions
- Steam profile lookup
- account linking and duplicate-account cases

### CFX

- authorization initiation
- successful identity callback
- invalid or expired state
- denied authorization
- account unlinking

### Tebex

- store, category, and package catalog reads
- basket creation and checkout redirects
- FiveM player authentication where supported by the plugin
- signed webhook delivery
- duplicate webhook delivery
- completion, refund, dispute, and recurring-payment events
- provider errors, invalid payloads, and timeouts

Mocks will use fixed fixtures, injectable clocks, and deterministic identifiers. Tests will control a
mock by selecting a named scenario, not by mutating arbitrary global response objects. Every mock server
will bind to an ephemeral local port and expose an explicit async shutdown function.

Production provider code must remain unchanged in semantics. Where a provider base URL or `fetch`
implementation is not currently injectable, the relevant plugin will gain a narrow server-only testable
transport option with a safe official-host default.

## Test Layers

### Package unit tests

Existing package tests remain responsible for pure transformations, validation, signature checking,
error normalization, and focused route behavior. The testbed will not duplicate these cases.

### Testbed integration tests

Bun tests will instantiate the complete Better Auth configuration and call its handler or server API.
Coverage includes:

- combined schema migration
- plugin IDs and endpoint registration without collision
- sign-up, sign-in, session creation, and sign-out
- authenticated and unauthenticated endpoint behavior
- trusted-origin enforcement
- Steam authentication and linking with mocked HTTP
- CFX initiation, callback, linking, and unlinking with mocked HTTP
- Tebex catalog, checkout, webhook, billing, and entitlement flows
- duplicate callback and webhook idempotency
- safe provider-error projection
- one plugin failing without corrupting unrelated plugin state

### React tests

React Testing Library will run under Bun with a DOM preload. These tests cover rendering and local
interaction contracts that do not require a full browser:

- signed-out and signed-in states
- plugin action loading and disabled states
- provider and validation errors
- catalog and entitlement rendering
- accessible labels, status messages, and keyboard interaction

Components will receive typed client adapters where practical so tests can use narrow fakes instead of
mocking the entire Better Auth client.

### Browser E2E tests

Playwright will start the testbed on an available local port and exercise the application through its
public UI and HTTP surface. It will cover a smaller set of high-value journeys:

1. Create an account, sign in, refresh the page, verify the session, and sign out.
2. Link Steam through the mocked OpenID redirect and return flow.
3. Link and unlink CFX through the mocked authorization flow.
4. Load the Tebex catalog, create a checkout, deliver a signed completion webhook, and observe the
   resulting entitlement.
5. Verify invalid callback state and invalid webhook signatures fail safely.

Browser tests will avoid inspecting private database tables unless the assertion is specifically about
persistence that cannot be observed through a supported API.

## Test Lifecycle

Test startup will:

1. Allocate temporary database and provider ports.
2. Start provider mocks.
3. Construct environment variables and typed test configuration.
4. Run the complete Better Auth migration set.
5. Start TanStack Start for browser suites.
6. Wait on an explicit health endpoint rather than a fixed delay.

Teardown will stop the application, stop every provider mock, close database connections, and remove
temporary files. Teardown must run after failed assertions. Processes left running after a suite are a
test failure.

## Commands

The root package will expose:

```text
bun run test                 # package and fast testbed tests
bun run test:integration     # complete Better Auth integration suite
bun run test:react           # React component suite
bun run test:e2e             # Playwright browser suite through Bun
bun run test:all             # all test layers
bun run testbed:dev          # interactive testbed development server
```

`bun run validate` will include the fast deterministic suites on every run. Browser E2E may have a
separate CI job if its runtime becomes excessive, but the required pull-request workflow must still run
it. Local `test:all` runs the same complete matrix.

## CI Design

GitHub Actions will install Bun and Playwright's pinned Chromium build, restore Bun's dependency cache,
and run the same package scripts used locally. CI will not contain live provider credentials.

The browser job will upload Playwright traces, screenshots, and the HTML report only when a test fails.
Temporary databases and mock request logs may be uploaded after sanitization. Logs must not contain
session cookies, callback state, basket identifiers, webhook secrets, or player identifiers.

Tests will use one browser worker initially to prevent accidental shared-state bugs. Parallelism can be
enabled only after database and provider isolation are demonstrated.

## Documentation

`apps/testbed/README.md` will document:

- the purpose and limitations of the testbed
- installation and every test command
- directory structure
- local development workflow
- safe test environment variables
- provider mock architecture and available scenarios
- how authentication state is created in integration and browser tests
- how to add a new server and client plugin
- where to place unit, integration, React, and browser tests
- how to update generated TanStack route files
- browser debugging, Playwright traces, and common failures
- the rule forbidding live credentials and live provider calls

The root README and plugin-authoring guide will link to the testbed README. The authoring guide will
require every new plugin to add combined-installation coverage and at least one end-to-end happy path
when it has browser-visible behavior.

## Error Handling and Diagnostics

- Provider mocks return stable scenario identifiers in test-only headers and logs.
- Test failures report the active scenario, allocated ports, and relevant request path.
- Response bodies and logs are bounded and sanitized.
- Health checks distinguish application startup failure from authentication route failure.
- Browser traces are retained on first retry or failure, not on every successful run.
- Retries are disabled for Bun tests and limited for browser tests in CI so nondeterminism remains
  visible.
- Timeouts are explicit per layer and long operations must explain why they need a larger timeout.

## Security Boundaries

- All credentials are fake and scoped to local provider mocks.
- Provider mocks reject non-loopback requests.
- Callback state, cookies, and webhook signatures still use production validation paths.
- Tests do not add bypasses to published plugin APIs.
- Better Auth `testUtils` cannot be enabled outside the test environment.
- Browser test routes and scenario controls are unavailable in production builds.
- Logs and failure artifacts redact secrets and authentication tokens.
- E2E tests bind servers to loopback interfaces and use ephemeral ports.

## Extending the Testbed

A new plugin must add:

1. Its package server plugin to the shared auth configuration.
2. Its client plugin when one exists.
3. Any combined schema or endpoint-conflict assertion.
4. A provider mock only when it communicates with an external service.
5. Integration coverage for its principal success and rejection paths.
6. A browser journey only when the plugin exposes browser-visible behavior.
7. README instructions for its configuration and scenarios.

The shared test support may gain an abstraction only after at least two plugins demonstrate the same
need. Provider-specific behavior remains in provider-specific modules.

## Delivery Phases

### Phase 1: application and combined auth

- Add the `apps/*` workspace and private testbed package.
- Scaffold TanStack Start, the auth route, React client, and minimal status UI.
- Install every Homestead server and client plugin.
- Add combined migrations and authentication smoke tests.

### Phase 2: deterministic provider infrastructure

- Add lifecycle-managed provider mock servers and fixtures.
- Add typed test configuration and temporary database helpers.
- Add Steam, CFX, and Tebex integration scenarios.

### Phase 3: React and browser flows

- Add the focused test UI and React Testing Library environment.
- Add Playwright configuration, server orchestration, and high-value browser journeys.
- Add failure artifacts and sanitization.

### Phase 4: CI and documentation

- Add root commands and required GitHub Actions coverage.
- Write the testbed README and update root authoring documentation.
- Run formatting, linting, type checks, all tests, all builds, and package checks.

## Acceptance Criteria

- A fresh clone can run the complete suite with Bun and no live provider credentials.
- The TanStack Start application loads and delegates `/api/auth/*` requests to Better Auth.
- CFX, Steam, and Tebex server and client plugins are installed together through public exports.
- The combined Better Auth schema migrates successfully in an isolated database.
- Bun integration tests cover authentication and each plugin's principal success and failure paths.
- React tests cover meaningful interface states and accessibility contracts.
- Browser tests complete authentication, Steam, CFX, and Tebex journeys through local provider mocks.
- Callback validation, webhook signature validation, and session cookies use production code paths.
- Tests do not contact live providers or leak secrets into logs and artifacts.
- Failed browser tests produce useful traces or screenshots.
- The README explains setup, commands, mocks, debugging, and adding future plugins.
- Repository formatting, linting, type checks, tests, builds, and package checks pass.

## References

- [TanStack Start React documentation](https://tanstack.com/start/latest/docs/framework/react/overview)
- [Better Auth TanStack Start integration](https://www.better-auth.com/docs/integrations/tanstack)
- [Better Auth test utilities](https://www.better-auth.com/docs/plugins/test-utils)
- [Bun test runner](https://bun.sh/docs/test)
- [Playwright test documentation](https://playwright.dev/docs/intro)
