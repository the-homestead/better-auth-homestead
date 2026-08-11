# Homestead GitHub App Connector Design

**Status:** Proposed for implementation
**Package:** `@itzdabbzz/better-auth-github-app`
**Plugin ID:** `github-app`

## Summary

Create a reusable Better Auth plugin that connects authenticated users to GitHub App installations.
The plugin will discover repositories the installation can access, provide a safe API for common
repository data, and persist verified webhook deliveries for reliable backend processing.

This is a repository integration, not a replacement identity provider. Applications may continue to
use Better Auth's built-in GitHub social provider for sign-in. Connecting a GitHub App installation is
a separate authenticated action because identity authorization and repository authorization have
different permissions and lifecycles.

The plugin owns GitHub installations, repository access, delivery persistence, and delivery retries.
Consumers own domain-specific relationships and mirrors. For example, Homestead owns the relationship
between a project and a GitHub repository and owns any issue data projected into that project.

## Goals

- Connect one Better Auth user to one or more personal or organization GitHub App installations.
- Allow multiple Better Auth users to authorize access to the same installation.
- Let GitHub administrators select exactly which repositories the app can access.
- Discover and synchronize accessible repositories without exposing GitHub tokens to browsers.
- Provide typed, paginated APIs for repositories, issues, and pull requests.
- Persist every verified webhook delivery before running consumer code.
- Process deliveries with at-least-once semantics, retries, and a dead-letter state.
- Expose typed hooks that consumers can use to update their own backend records.
- Keep the package portable across Better Auth database adapters and Bun/Node runtimes.

## Non-goals

- Replacing Better Auth's GitHub social login in the first release.
- Owning Homestead projects or a project-to-repository join table.
- Maintaining a normalized local mirror of every GitHub issue, pull request, release, or commit.
- Acting as an unrestricted browser-to-GitHub API proxy.
- Storing installation access tokens; they are short-lived and minted when required.
- Supporting GitHub Enterprise Server in the first release.
- Providing a general background-job framework.

## Why a GitHub App

### Selected: separate GitHub App connector

A GitHub App provides fine-grained repository permissions, lets an installer select individual
repositories, supports installation webhooks, and uses short-lived installation tokens. This matches
the project-linking use case and limits the impact of a leaked token.

The plugin will coexist with Better Auth's `socialProviders.github`. A user may sign in by any method
and then connect GitHub repositories from account or project settings.

### Rejected: expand the built-in GitHub OAuth provider

The OAuth App `repo` scope grants broad access to all repositories the user can reach and cannot offer
installation-style repository selection. It also couples login permissions to project integration
permissions. This is too broad for a reusable plugin.

### Deferred: combined GitHub identity and installation flow

A later opt-in package layer could coordinate GitHub login and installation onboarding in one UI.
Internally, the identity account and installation authorization must remain separate. Combining them in
the first release would complicate account linking and prevent non-GitHub users from connecting repos.

## GitHub App Configuration

The consuming application creates a GitHub App and supplies these server-only values:

- App ID
- App slug
- OAuth client ID and client secret
- Private key
- Webhook secret
- Internal worker secret

The GitHub App enables user authorization during installation. That produces an authorization code the
plugin can exchange and use to prove that the current user can see the claimed installation. The plugin
must never trust the callback's `installation_id` by itself.

Recommended initial repository permissions:

- Metadata: read
- Contents: read
- Issues: read
- Pull requests: read

Recommended initial events:

- `installation`
- `installation_repositories`
- `repository`
- `issues`
- `pull_request`

Consumers that need mutations may configure the GitHub App with Issues or Pull requests write access.
The plugin checks the installation's granted permissions before exposing a mutation. Adding permissions
later requires installation owners to approve the change in GitHub.

## Package Surface

The package has three entry points:

```text
@itzdabbzz/better-auth-github-app
@itzdabbzz/better-auth-github-app/client
@itzdabbzz/better-auth-github-app/server
```

The root entry exports the Better Auth plugin, configuration types, normalized response types, error
codes, and schema. The client entry exports Better Auth client inference and path-method mappings. The
server entry exports server-only helpers for GitHub API access and delivery processing; it must never
be bundled into browser code.

Proposed setup:

```ts
githubApp({
  appId: process.env.GITHUB_APP_ID!,
  appSlug: process.env.GITHUB_APP_SLUG!,
  clientId: process.env.GITHUB_APP_CLIENT_ID!,
  clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
  privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  webhookSecret: process.env.GITHUB_APP_WEBHOOK_SECRET!,
  workerSecret: process.env.GITHUB_APP_WORKER_SECRET!,
  handlers: {
    issues: async ({ action, payload, repository }) => {
      // Update application-owned projections.
    },
  },
});
```

All credentials remain configuration values. None are written to package source, plugin tables, logs,
API responses, or webhook delivery records.

## Data Model

### `githubAppInstallation`

Represents a GitHub App installation.

- `id`: Better Auth database ID
- `installationId`: GitHub installation ID, unique and stored as a string
- `accountId`: GitHub user or organization ID
- `accountLogin`: current GitHub login
- `accountType`: `User` or `Organization`
- `repositorySelection`: `all` or `selected`
- `permissions`: JSON snapshot of granted permissions
- `events`: JSON snapshot of subscribed events
- `installedAt`, `updatedAt`
- `suspendedAt`: nullable
- `deletedAt`: nullable tombstone used to preserve delivery history

### `githubAppInstallationUser`

Records which Better Auth users have proved access to an installation.

- `id`
- `installationId`: foreign key to `githubAppInstallation`
- `userId`: foreign key to Better Auth `user`
- `githubUserId`
- `githubLogin`
- `authorizedAt`
- `lastValidatedAt`
- unique pair: `installationId`, `userId`

The authorization token used to prove access is discarded after verification. Revalidation runs through
a new authorization flow rather than retaining a long-lived user token.

### `githubAppRepository`

Caches repository identity and availability, not repository domain content.

- `id`
- `installationId`: foreign key to `githubAppInstallation`
- `repositoryId`: stable GitHub repository ID
- `nodeId`
- `ownerLogin`, `name`, `fullName`
- `private`, `archived`
- `defaultBranch`
- `htmlUrl`
- `active`: false after access is removed
- `lastSyncedAt`
- unique pair: `installationId`, `repositoryId`

Consumers should persist `repositoryId`, not `owner/name`, when linking a domain object. Renames and
transfers then remain safe.

### `githubAppWebhookDelivery`

A durable inbox record for one GitHub webhook delivery.

- `id`
- `deliveryId`: `X-GitHub-Delivery`, unique idempotency key
- `event`, `action`
- `installationId`: nullable for events without an installation
- `repositoryId`: nullable
- `payload`: verified raw JSON text
- `status`: `pending`, `processing`, `processed`, `failed`, `dead-letter`, or `ignored`
- `attempts`
- `receivedAt`, `processingStartedAt`, `processedAt`
- `nextAttemptAt`
- `lastError`: bounded and sanitized

Raw payload retention defaults to 30 days and is configurable. Processed rows may retain their event
metadata after payload deletion for audit and idempotency. Pending, failed, and dead-letter payloads are
never pruned by the normal retention pass.

## Installation Flow

1. An authenticated user calls `POST /github-app/connect` with trusted success and error callback URLs.
2. The plugin creates random, single-use state in Better Auth's verification storage. The state binds
   the Better Auth user, callbacks, and expiration.
3. The client redirects to `https://github.com/apps/{slug}/installations/new?state=...`.
4. GitHub installs or updates the app, performs user authorization, and returns an authorization code,
   installation ID, setup action, and state.
5. The plugin atomically consumes state and verifies that the current session matches the initiating
   user.
6. It exchanges the code for a temporary GitHub App user access token.
7. It lists installations visible to that user and rejects the callback unless the claimed installation
   is present.
8. Using an app installation token, it fetches installation metadata and all accessible repositories.
9. Installation, user membership, and repositories are upserted transactionally.
10. The temporary user token is discarded and the user is redirected to the trusted callback.

Repeated callbacks fail because state is single-use. An existing installation may be connected by
another Better Auth user only after that user independently proves access through GitHub authorization.

## Repository and GitHub API Access

Browser endpoints use session middleware and only return installations connected to the current user:

- `POST /github-app/connect`
- `GET /github-app/callback` (server callback; not exposed through the client plugin)
- `GET /github-app/installations`
- `POST /github-app/installations/sync`
- `POST /github-app/disconnect`
- `GET /github-app/repositories`
- `GET /github-app/repository`
- `GET /github-app/issues`
- `GET /github-app/issue`
- `GET /github-app/pull-requests`
- `GET /github-app/pull-request`

List endpoints use cursor or page-based pagination with bounded page sizes. Repository selection is by
stable numeric ID. The server checks the user's installation membership and repository activity before
minting a scoped installation token.

The first release exposes read operations. Write operations can be added as explicit typed endpoints;
there will be no arbitrary URL proxy. Server-side consumers that need additional operations may use a
helper that creates an authenticated GitHub client after the consumer supplies an installation and
repository already authorized by its own domain rules.

Installation tokens are minted on demand, limited to the selected repository and the minimum requested
permissions, cached in memory only until shortly before expiry, and never returned from an endpoint.

## Project Linking Boundary

The plugin does not know what a Homestead project is. A consuming application creates its own join,
for example:

```text
projectGithubRepository
  projectId
  githubRepositoryId
  linkedByUserId
  linkedAt
```

Before creating the join, the application verifies through the plugin that the acting user can access
the repository. Thereafter the application can resolve the stable repository ID against the plugin's
repository cache. If installation access is removed, `active` becomes false and the consumer receives
an installation or repository-removal delivery.

This boundary lets the same connector support projects, changelogs, deployment tracking, moderation,
release feeds, or other features without embedding those domains in authentication infrastructure.

## Webhook Ingestion and Processing

### Ingestion

`POST /github-app/webhook` is unauthenticated by Better Auth session but authenticated by GitHub's
signature. It performs only bounded work:

1. Read the unmodified request body with a configured maximum size.
2. Require `X-GitHub-Delivery`, `X-GitHub-Event`, and `X-Hub-Signature-256`.
3. Verify HMAC-SHA256 with a timing-safe comparison before parsing JSON.
4. Validate the minimal envelope needed for routing.
5. Insert the delivery using the delivery ID as a unique idempotency key.
6. Return success immediately for new or duplicate valid deliveries.

Invalid signatures and oversized or malformed bodies are rejected and not persisted.

### Processing

Deliveries use at-least-once processing. The plugin first applies internal projections for installation
and repository lifecycle events, then runs configured consumer handlers. A handler receives the typed
event/action, parsed payload, installation record, repository record when present, and a server-only
installation client.

The plugin does not depend on in-process background work, which is unreliable in serverless and
multi-instance deployments. A protected worker endpoint claims pending rows using database-safe leases:

- `POST /github-app/internal/process-deliveries`

The caller must provide `Authorization: Bearer <workerSecret>`. The secret is compared in constant time.
The endpoint processes a bounded batch and returns counts only. Consumers invoke it from a cron job,
queue worker, or durable scheduler. An optional best-effort inline wake-up may reduce latency but never
replaces persisted processing.

Failed handlers receive exponential backoff with jitter. After the configured maximum attempts, the
delivery moves to `dead-letter`. A protected endpoint can retry a specific dead-letter delivery. Handler
authors must be idempotent because a crash can occur after side effects but before the delivery is
marked processed.

Events without configured handlers are marked `ignored` after internal lifecycle processing. Duplicate
delivery IDs return success without executing handlers again.

## Hooks

Configuration supports exact event handlers and a wildcard observer:

```ts
handlers: {
  issues: async (context) => {},
  pull_request: async (context) => {},
  "installation_repositories": async (context) => {},
  "*": async (context) => {},
}
```

Event payload types come from GitHub's maintained webhook type definitions. The event name narrows the
payload; handlers may further switch on `action`. The wildcard handler receives the shared envelope and
an unknown payload.

Handlers run in deterministic order: internal projection, exact handler, wildcard handler. Failure in
any stage leaves the delivery retryable. Consumer hooks cannot modify signature or delivery identity
fields.

## Consistency and Synchronization

Webhooks are the primary source of changes after installation. Explicit synchronization remains
necessary because webhooks can be delayed, disabled, or manually redelivered.

- Installation completion performs a full repository sync.
- `installation_repositories` incrementally activates or deactivates repositories.
- `repository` updates names, ownership, archival status, and deletion state.
- A user-triggered sync is rate-limited per installation.
- Consumers should schedule a daily reconciliation for active installations.
- A suspended or deleted installation cannot mint tokens and all repositories become inactive.

Database writes for installation metadata, memberships, and repository synchronization use a
transaction when the adapter supports it. Webhook idempotency remains enforced by a unique delivery ID
even without transaction support.

## Authorization Rules

- Connecting, listing, syncing, and disconnecting require a Better Auth session.
- A user sees only installations joined through `githubAppInstallationUser`.
- Repository APIs require both installation membership and an active repository record.
- Disconnecting removes only that user's membership. It does not uninstall the GitHub App.
- Installation deletion and suspension come from verified GitHub data or webhooks, never browser input.
- Project-level authorization remains the consumer's responsibility.
- Internal worker and retry endpoints use a separate high-entropy worker secret and are rate-limited.
- No endpoint returns private keys, client secrets, webhook secrets, user tokens, or installation tokens.

## Error Model

The client receives stable Better Auth plugin errors, including:

- `GITHUB_APP_STATE_EXPIRED`
- `GITHUB_APP_INSTALLATION_NOT_FOUND`
- `GITHUB_APP_INSTALLATION_NOT_AUTHORIZED`
- `GITHUB_APP_INSTALLATION_SUSPENDED`
- `GITHUB_APP_REPOSITORY_NOT_FOUND`
- `GITHUB_APP_REPOSITORY_ACCESS_REVOKED`
- `GITHUB_APP_PERMISSION_REQUIRED`
- `GITHUB_APP_RATE_LIMITED`
- `GITHUB_APP_API_UNAVAILABLE`
- `GITHUB_APP_WEBHOOK_INVALID`
- `GITHUB_APP_WORKER_UNAUTHORIZED`

GitHub response bodies and credentials are not copied into client errors. Rate-limit responses include a
safe retry timestamp when GitHub provides one. Webhook handler errors are sanitized before persistence.

## Security Requirements

- Use server-side, random, expiring, single-use installation state bound to the Better Auth user.
- Validate every redirect against Better Auth trusted origins.
- Prove installation visibility using the temporary GitHub user token; never trust `installation_id`
  from the callback alone.
- Verify the raw webhook body before parsing with HMAC-SHA256 and constant-time comparison.
- Enforce a configurable webhook body limit and reject unsupported content types.
- Generate GitHub App JWTs with short expiry and keep private keys server-only.
- Mint repository-restricted installation tokens with minimum permissions whenever supported.
- Never persist installation tokens; discard temporary user tokens after installation verification.
- Treat GitHub IDs as strings to avoid JavaScript integer precision problems.
- Use stable repository IDs for authorization and linking, not repository names or URLs.
- Redact authorization headers, tokens, private keys, webhook signatures, and payload secrets from logs.
- Rate-limit connect, sync, read, worker, and retry endpoints separately.

## Testing Strategy

Unit tests cover:

- GitHub App JWT creation and expiration
- HMAC signature validation, malformed headers, and timing-safe comparison
- single-use state creation, expiry, session binding, and replay rejection
- installation callback spoof rejection
- permission evaluation and repository authorization
- token cache expiry without token persistence
- payload envelope parsing and delivery status transitions
- retry backoff, lease expiry, dead-letter behavior, and idempotency

Better Auth integration tests use the repository's plugin test kit and in-memory SQLite to cover:

- schema migration and unique constraints
- typed server and client endpoint registration
- connecting personal and organization installations
- multiple users joined to one installation
- repository synchronization, removal, rename, and transfer
- session isolation across installations
- persisted webhook ingestion followed by worker processing
- duplicate delivery acceptance without duplicate handler execution
- handler failure followed by successful retry
- disconnect behavior without uninstalling the app

Provider HTTP is mocked at the network boundary. Fixtures are reduced, synthetic payloads containing no
real credentials or user data. A manual pre-release checklist verifies one real personal installation,
one organization installation, selected-repository changes, a webhook redelivery, and installation
suspension.

## Delivery Plan

### Phase 1: package foundation

- Scaffold `packages/github-app` with server and client exports.
- Add GitHub SDK and webhook type dependencies.
- Define configuration validation, schema, normalized types, and stable errors.
- Add Better Auth installation tests and package export checks.

### Phase 2: secure installation connection

- Implement GitHub App JWT and installation-token services.
- Implement single-use connect state and user authorization callback.
- Verify installation visibility and synchronize repositories.
- Add installation, membership, repository, and disconnect endpoints.

### Phase 3: repository API

- Add repository, issue, and pull-request read endpoints.
- Add pagination, permission checks, token narrowing, and rate-limit mapping.
- Export a guarded server helper for consumer-owned GitHub operations.

### Phase 4: durable webhooks

- Implement raw-body signature verification and idempotent delivery persistence.
- Add internal installation/repository lifecycle projections.
- Add leased processing, typed handlers, retries, dead-letter state, and retention cleanup.
- Add worker and retry endpoints protected by the worker secret.

### Phase 5: release readiness

- Document GitHub App registration, permissions, callback URLs, webhook URL, and worker deployment.
- Run repository validation, package dry-run, security review, and live GitHub App smoke tests.
- Add a Changeset and publish only after the live installation and webhook checklist passes.

## Acceptance Criteria

- A signed-in Better Auth user can install or connect the GitHub App and see only repositories granted
  to that installation.
- A spoofed installation ID, replayed callback, untrusted redirect, or mismatched session is rejected.
- A consumer can save a stable repository ID against any domain object without depending on repo names.
- Repository, issue, and pull-request reads never expose GitHub credentials.
- Every valid webhook is persisted once before consumer processing begins.
- A failed consumer handler retries and eventually reaches either `processed` or `dead-letter`.
- Repository access removal makes the cached repository inactive and becomes observable through a typed
  delivery handler.
- The plugin works alongside Better Auth's built-in GitHub social provider without provider-ID or
  endpoint collisions.
- All tests, type checks, lint checks, builds, and package export checks pass.

## References

- [Better Auth plugins](https://www.better-auth.com/docs/concepts/plugins)
- [Better Auth OAuth and access tokens](https://www.better-auth.com/docs/concepts/oauth)
- [GitHub App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
- [GitHub App installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)
- [GitHub App setup URLs](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/about-the-setup-url)
- [GitHub webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [Stargate Better Auth reference](https://github.com/neiii/stargate-better-auth/blob/main/src/plugins/stargate-better-auth/index.ts)
