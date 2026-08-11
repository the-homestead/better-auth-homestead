# Homestead Tebex Plugin Design

**Status:** Approved direction; pending implementation plan
**Package:** `@itzdabbzz/better-auth-tebex`
**Plugin ID:** `tebex`

## Summary

Create a first-class Better Auth plugin for Tebex Headless stores. The plugin will connect authenticated
users and organizations to Tebex baskets, persist payment and recurring-payment state from verified
webhooks, and expose durable application entitlements. It will provide the same kind of authentication-
aware billing boundary that Better Auth's Stripe plugin provides, adapted to Tebex packages, player
identity, refunds, disputes, and game-store checkout.

The first release covers storefront reads, basket checkout, payments, recurring payments, entitlements,
and durable webhooks. Tebex game-server command polling and acknowledgement will be designed later as an
optional server module so the billing plugin remains useful outside FiveM and does not turn an auth
server into a game runtime.

The supplied `ideas/tebex` code is reference material. Its provider-neutral SDK logic, Zod schemas,
webhook cryptography, and tests will be adapted. Next.js, React, `server-only`, `@zstore`, storefront UI,
and environment-specific code will not enter the published package.

## Goals

- Integrate Tebex Headless checkout with Better Auth users and organizations.
- Support FiveM, Discord, Minecraft, universal, and future Tebex username types.
- List configured Tebex categories and packages through typed, cacheable endpoints.
- Create baskets that are securely correlated with a Better Auth billing owner.
- Support Tebex-hosted player authentication when no trusted player identifier is available.
- Treat verified webhooks as the only authority for payment and subscription state.
- Persist payments, recurring payments, entitlements, and webhook deliveries idempotently.
- Revoke or suspend access correctly after refunds, disputes, cancellations, and expiration.
- Expose typed client methods and server-only entitlement checks.
- Allow consumers to map Tebex packages to their own stable entitlement keys.
- Work with the Homestead Steam, CFX, GitHub App, and soft-deletion plugins without requiring them.

## Non-goals

- Replacing Tebex as merchant of record or calculating tax locally.
- Confirming payment from browser redirects or Tebex.js events.
- Mirroring the entire Tebex control panel.
- Creating or editing Tebex packages in the first release.
- Executing game-server commands in the Better Auth process.
- Polling the Tebex Plugin API command queue.
- Shipping React, Next.js, cart UI, product-card UI, or a storefront theme.
- Supporting the compliance-gated Tebex Checkout API in the first release.
- Storing card data or payment-method details.
- Acting as an unrestricted proxy to Tebex APIs.

## Approaches Considered

### Selected: Headless billing and entitlement plugin

Use the Tebex Headless API for catalog and basket operations, then consume Tebex webhooks to maintain
payments, recurring payments, and derived entitlements. This API supports existing creator packages and
FiveM authentication without requiring access to the compliance-gated Checkout API.

This is the closest equivalent to Better Auth's Stripe integration while respecting Tebex's gaming
model.

### Rejected: checkout-link helper only

A small basket helper would be easy, but it would leave every consumer to rebuild signature validation,
payment correlation, refund handling, recurring state, and entitlement checks. That is not first-class.

### Deferred: full checkout plus command delivery

The Tebex Game Server API has a polling protocol with `next_check`, online/offline commands,
acknowledgements, and server-specific execution. Mixing that runtime with billing webhooks would make
the package harder to deploy safely. A later `@itzdabbzz/better-auth-tebex/server` extension may expose
shared types and credentials, but command execution remains a separate process and design.

## Better Auth Integration

The plugin uses current Better Auth facilities:

- plugin schema for billing records and private user fields
- `createAuthEndpoint` with session, sensitive-session, and origin middleware
- a separate Better Auth client plugin for inferred endpoints
- Better Auth trusted-origin checks for completion, cancellation, and error URLs
- organization membership checks when organization billing is enabled
- database adapters and migrations through the normal Better Auth plugin schema
- plugin rate limits and structured error codes
- Better Auth logger and request context
- user and organization lifecycle hooks for customer metadata cleanup

The plugin does not configure a social provider. A Tebex player identity is a checkout/delivery identity,
not a Better Auth login identity.

## Configuration

```ts
tebex({
  publicToken: process.env.TEBEX_PUBLIC_TOKEN!,
  privateKey: process.env.TEBEX_PRIVATE_KEY!,
  webhookSecret: process.env.TEBEX_WEBHOOK_SECRET!,
  workerSecret: process.env.TEBEX_WORKER_SECRET!,
  packages: [
    {
      packageId: 6276316,
      entitlements: [{ key: "supporter", mode: "recurring" }],
    },
  ],
  organization: {
    enabled: true,
    authorize: async ({ organizationId, user, action }) => {},
  },
  resolvePlayer: async ({ user, package: tebexPackage }) => {
    return null;
  },
  handlers: {
    entitlementChanged: async (event) => {},
    paymentChanged: async (event) => {},
  },
});
```

Required credentials are server-only. `publicToken` identifies the webstore. `privateKey` authenticates
private Headless API calls. `webhookSecret` verifies raw webhook bodies. `workerSecret` protects internal
delivery-processing and reconciliation endpoints.

Package mappings are an allowlist. Browser callers cannot purchase an arbitrary package ID unless the
plugin configuration explicitly permits dynamic packages through a server-side policy callback.

## Package Exports

```text
@itzdabbzz/better-auth-tebex
@itzdabbzz/better-auth-tebex/client
@itzdabbzz/better-auth-tebex/server
```

The root exports the Better Auth plugin, schema, normalized public types, package mapping types, and
error codes. The client entry exports Better Auth inference and endpoint path methods. The server entry
exports the provider client, webhook types, entitlement helpers, reconciliation helpers, and worker
operations. It must never be bundled into browser code.

## Provider SDK

The SDK is runtime-neutral and injected with configuration, `fetch`, clock, and logger dependencies. It
must not import environment variables, React cache, Next.js headers/navigation, or application types.

Initial SDK capabilities:

- get webstore metadata
- list categories with optional packages
- list and fetch packages
- create and fetch baskets
- get Tebex player-authentication links
- add, remove, and update basket packages
- apply and remove coupons, gift cards, and creator codes
- update tiered-category selection where supported
- fetch CMS pages and sidebar modules as server-only optional catalog helpers
- validate Tebex webhook signatures and envelopes

Every provider response is parsed with Zod. Provider errors map to stable internal error categories while
retaining a redacted server-only cause. HTTP requests use timeouts, bounded retries for safe idempotent
reads, and no automatic retries for unsafe writes unless an idempotency strategy exists.

The SDK accepts a Tebex API version/base URL abstraction, but the first release allows only official
HTTPS Tebex hosts.

## Data Model

### `tebexCustomer`

Represents the Better Auth billing owner.

- `id`
- `referenceId`: Better Auth user or organization ID
- `customerType`: `user` or `organization`
- `email`: last checkout email snapshot, private and nullable
- `createdAt`, `updatedAt`
- unique pair: `referenceId`, `customerType`

This is an internal customer concept; Tebex does not expose a Stripe-style reusable customer object.

### `tebexPlayerIdentity`

Stores a player identity proved through Tebex authentication or a trusted resolver.

- `id`
- `userId`: Better Auth user ID
- `usernameType`: normalized Tebex username type
- `identifier`: provider player identifier, private
- `displayName`: nullable
- `source`: `tebex-auth` or `resolver`
- `verifiedAt`, `lastUsedAt`
- unique pair: `usernameType`, `identifier`

An organization checkout still has an initiating Better Auth user and, when delivery requires it, a
beneficiary player identity.

### `tebexBasket`

Persists each checkout attempt.

- `id`
- `ident`: Tebex basket identifier, unique and private
- `checkoutReference`: random opaque correlation value, unique
- `customerId`
- `initiatedByUserId`
- `beneficiaryUserId`: nullable
- `playerIdentityId`: nullable
- `status`: `created`, `awaiting-player-auth`, `ready`, `redirected`, `completed`, `expired`, or `cancelled`
- `packageSnapshot`: JSON of allowed package IDs, quantities, and variable data
- `currency`, `amount`: nullable snapshots, never authoritative before webhook completion
- `completeURL`, `cancelURL`: trusted normalized destinations
- `expiresAt`, `completedAt`, `createdAt`, `updatedAt`

Tebex basket `custom` data contains only `checkoutReference` and a schema version. It never contains a
raw Better Auth user ID, organization ID, email, or entitlement key. Webhooks resolve the opaque value
against the database.

### `tebexPayment`

- `id`
- `transactionId`: Tebex transaction ID, unique
- `customerId`: nullable if correlation fails
- `basketId`: nullable
- `status`: normalized complete, pending, declined, refunded, disputed, chargeback, or unknown
- `currency`, `amount`
- `email`: private snapshot where required for billing history
- `playerIdentity`: private normalized snapshot
- `packages`: validated JSON snapshot
- `createdAt`, `updatedAt`, `completedAt`, `refundedAt`

Uncorrelated valid payments remain persisted for reconciliation but grant no entitlement.

### `tebexRecurringPayment`

- `id`
- `reference`: Tebex recurring-payment reference, unique
- `customerId`
- `status`: `active`, `overdue`, `cancel-pending`, `cancelled`, `expired`, or `unknown`
- `packageId`
- `initialTransactionId`: nullable
- `nextPaymentAt`, `cancelledAt`, `endedAt`
- `createdAt`, `updatedAt`

### `tebexEntitlement`

- `id`
- `customerId`
- `beneficiaryUserId`: nullable
- `key`: consumer-defined stable entitlement key
- `packageId`
- `sourceType`: `payment` or `recurring-payment`
- `sourceReference`
- `status`: `active`, `suspended`, `revoked`, or `expired`
- `quantity`
- `startsAt`, `endsAt`: nullable
- `metadata`: bounded consumer metadata
- `createdAt`, `updatedAt`
- unique source grant key to prevent duplicate webhook grants

Access checks evaluate active, non-expired grants. Multiple grants for the same key are additive only
when the package mapping explicitly enables quantities; otherwise any active grant satisfies access.

### `tebexWebhookDelivery`

- `id`
- `deliveryId`: Tebex webhook ID, unique
- `type`
- `occurredAt`
- `payload`: verified raw JSON text
- `status`: `pending`, `processing`, `processed`, `failed`, `dead-letter`, or `ignored`
- `attempts`, `nextAttemptAt`
- `processingLeaseId`, `processingLeaseExpiresAt`
- `lastError`: bounded and sanitized
- `receivedAt`, `processedAt`

Payload retention defaults to 30 days. Metadata and delivery IDs may be retained longer for
idempotency. Failed and dead-letter payloads are excluded from normal pruning.

## Checkout Flow

### Start checkout

`POST /tebex/checkout`

1. Require a Better Auth session and origin validation.
2. Resolve user or organization billing ownership and authorize organization access.
3. Validate package IDs, quantities, variable data, gifting, and tier changes against configuration.
4. Resolve an existing trusted player identity when the store/package requires one.
5. Create the local basket row with a random opaque checkout reference.
6. Create the Tebex basket using trusted complete/cancel URLs, client IP when valid, player identity when
   known, and the opaque custom reference.
7. Add packages and allowed discount inputs.
8. If Tebex player authentication is required, return its authentication URL and mark the basket
   `awaiting-player-auth`.
9. Otherwise return the Tebex checkout URL and mark the basket `redirected`.

The endpoint returns `{ url, redirect, flow: "player-auth" | "checkout" }`. It never returns provider
credentials or local correlation data.

### Player-auth return

`GET /tebex/auth/callback`

- Uses random, expiring, single-use state stored through Better Auth verification storage.
- Requires the same initiating Better Auth session.
- Fetches the basket from Tebex rather than trusting callback query values.
- Extracts the correct identifier field for the store type, including FiveM `user_id`.
- Upserts the verified player identity and binds it to the local basket.
- Adds the pending packages if they were not added before authentication.
- Redirects only to the stored trusted callback.

### Completion return

The completion URL is presentation only. It may show the basket as pending and poll a status endpoint,
but it cannot grant access. Only a processed `payment.completed` webhook activates entitlements.

## Catalog Endpoints

- `GET /tebex/store`
- `GET /tebex/categories`
- `GET /tebex/packages`
- `GET /tebex/package`

Catalog responses are normalized and omit unsafe HTML by default. The package may expose raw
descriptions to trusted server callers, while browser responses return sanitized content and typed media.
Caching honors configured TTLs and never caches credentials or user-specific baskets.

The supplied description parser is not part of the auth plugin core. It may become a separate optional
export only if its API is generalized and XSS behavior is explicitly tested.

## Billing and Entitlement Endpoints

- `GET /tebex/billing/payments`
- `GET /tebex/billing/recurring-payments`
- `GET /tebex/entitlements`
- `POST /tebex/entitlements/check`
- `POST /tebex/recurring-payment/cancel` when supported by the configured API

All endpoints require a session. Organization queries require consumer-provided organization
authorization. Responses are normalized local state; browser endpoints do not forward arbitrary Tebex
queries.

The server entry exposes:

- `hasTebexEntitlement`
- `listTebexEntitlements`
- `assertTebexEntitlement`
- `reconcileTebexPayment`
- `reconcileTebexRecurringPayment`

Server helpers require the caller to provide or prove its own domain authorization.

## Webhook Ingestion

`POST /tebex/webhook` is authenticated by Tebex rather than a Better Auth session.

1. Read the unchanged raw body with a configured size limit.
2. Require `X-Signature`.
3. SHA-256 hash the raw body, then calculate the Tebex HMAC-SHA256 signature using the webhook secret.
4. Compare fixed-length signatures in constant time.
5. Optionally validate the source IP as defense in depth. Signature validation remains authoritative
   because deployments may sit behind proxies and Tebex IP ranges may change.
6. Parse the standard `id`, `type`, `date`, and `subject` envelope with Zod.
7. Handle `validation.webhook` with Tebex's required `{ id }` response.
8. Persist other verified deliveries idempotently by webhook ID before returning a 2xx response.

Malformed or invalidly signed requests are not persisted. A duplicate valid webhook returns success and
does not create another delivery.

## Webhook Processing

The protected worker endpoint is:

- `POST /tebex/internal/process-deliveries`

It requires `Authorization: Bearer <workerSecret>` with constant-time comparison and processes a bounded
leased batch. Webhooks use at-least-once semantics, so all internal projections and consumer handlers
must be idempotent.

Processing order:

1. Parse and validate the event-specific subject.
2. Resolve the opaque checkout reference or existing transaction/recurring reference.
3. Upsert payment or recurring-payment state.
4. Apply package-to-entitlement transitions transactionally where supported.
5. Invoke exact typed consumer handlers.
6. Invoke a wildcard audit handler.
7. Mark the delivery processed.

Failures retry with exponential backoff and jitter, then move to dead-letter after the configured
attempt limit. Server-only inspection and retry helpers expose dead-letter deliveries without returning
raw payloads by default.

## Event State Rules

- `payment.completed`: upsert a completed payment and activate mapped one-time entitlements.
- `payment.declined`: record the decline; never grant access.
- `payment.refunded`: mark refunded and revoke grants sourced only from that transaction.
- `payment.dispute.opened`: suspend sourced grants immediately by default.
- `payment.dispute.won`: restore grants when no other revocation reason exists.
- `payment.dispute.lost`: permanently revoke sourced grants.
- `payment.dispute.closed`: reconcile the final payment status before changing access.
- `recurring-payment.started`: activate or create the recurring grant.
- `recurring-payment.renewed`: extend/reconfirm the grant and update the next billing date.
- `recurring-payment.cancellation.requested`: mark cancel-pending but retain access through the paid
  period.
- `recurring-payment.cancellation.aborted`: return to active.
- `recurring-payment.ended`: expire or revoke the recurring entitlement.

Unknown event types are persisted and marked ignored after the wildcard handler. Unknown payment and
recurring statuses fail closed for new access and remain available for reconciliation.

## Package-to-Entitlement Mapping

Mappings are configuration, not inferred from mutable package names:

```ts
{
  packageId: 6276316,
  entitlements: [
    { key: "supporter", mode: "recurring" },
    { key: "queue.priority", mode: "recurring", metadata: { level: 2 } },
  ],
}
```

Package IDs are stable provider identifiers; entitlement keys are stable application identifiers.
Changing a mapping affects future events and explicit reconciliation, not historical grants silently.
The release documentation must explain the migration procedure for mapping changes.

Consumers may define `resolveEntitlements({ package, payment, recurringPayment })` for advanced cases,
but its result is validated and bounded before persistence.

## User and Organization Ownership

User billing uses the Better Auth user ID as the internal reference. Organization billing is optional and
requires a consumer authorization callback because Better Auth organization roles are application-
defined. A checkout stores both the billing owner and initiating user.

A beneficiary may differ from the billing owner for gifting or organization purchases. The consumer
must explicitly enable gifting and authorize the beneficiary. Browser input alone cannot redirect an
entitlement to another user.

Deleting a Better Auth user does not erase financial records required for accounting. User-facing joins
are detached or pseudonymized according to consumer policy, while transaction IDs, amounts, currencies,
and entitlement audit state remain. The soft-deletion plugin can call a server helper to suspend user
entitlements during recovery and finalize pseudonymization during purge.

## Security Requirements

- Keep Tebex private keys and webhook/worker secrets server-only.
- Validate provider responses and webhook subjects with Zod.
- Verify webhooks from the unmodified raw body before JSON parsing.
- Use constant-time comparisons for webhook and worker secrets.
- Never grant access from redirects, query parameters, basket totals, or Tebex.js events.
- Correlate checkouts through a random opaque database reference in basket custom data.
- Bind player-auth state to user, basket, purpose, trusted callbacks, and expiration.
- Fetch the authoritative Tebex basket after player authentication.
- Validate package IDs and variable data against an allowlist or server policy.
- Sanitize catalog HTML before returning it to browsers.
- Validate trusted origins for every redirect URL.
- Rate-limit checkout, player-auth, catalog, entitlement, worker, and reconciliation operations.
- Bound raw webhook bodies, persisted errors, metadata, quantities, and page sizes.
- Do not log basket identifiers, player identifiers, emails, credentials, gift cards, or coupon values.
- Do not treat forwarded client IP headers as trustworthy unless the consumer configures trusted proxies.

## Error Model

Stable errors include:

- `TEBEX_CONFIGURATION_INVALID`
- `TEBEX_PACKAGE_NOT_ALLOWED`
- `TEBEX_PACKAGE_UNAVAILABLE`
- `TEBEX_PLAYER_IDENTITY_REQUIRED`
- `TEBEX_PLAYER_AUTH_EXPIRED`
- `TEBEX_BASKET_NOT_FOUND`
- `TEBEX_BASKET_EXPIRED`
- `TEBEX_CHECKOUT_UNAVAILABLE`
- `TEBEX_ORGANIZATION_FORBIDDEN`
- `TEBEX_ENTITLEMENT_REQUIRED`
- `TEBEX_WEBHOOK_INVALID`
- `TEBEX_WORKER_UNAUTHORIZED`
- `TEBEX_RATE_LIMITED`
- `TEBEX_API_UNAVAILABLE`
- `TEBEX_RECONCILIATION_REQUIRED`

Provider error bodies remain server-only and redacted. Client errors include a safe retry hint only when
known.

## Reconciliation

Webhooks are authoritative but not assumed infallible. The plugin supports bounded reconciliation:

- reconcile a transaction by Tebex transaction ID
- reconcile a recurring payment by reference
- find locally pending baskets older than a configured threshold
- identify uncorrelated verified payments
- retry dead-letter webhook deliveries

Internal reconciliation endpoints require the worker secret. User-facing status polling reads local
state and does not hammer Tebex.

## Reuse of Supplied Ideas

### Reuse after extraction

- Headless API endpoint coverage and request shapes from `ideas/tebex/sdk.ts`
- Zod schemas for stores, categories, packages, baskets, auth links, CMS pages, and modules
- platform-to-identifier mapping
- basket identifier and variable-data validation
- checkout-link extraction
- raw-body Tebex signature algorithm
- error normalization
- the 206 current tests as contract and regression inputs

### Rewrite for the package

- SDK construction and credential injection
- checkout orchestration and callback state
- IP handling and trusted-proxy behavior
- webhook origin checks and persistence
- Next.js server actions
- React cache and storefront mapping
- all `@zstore` environment, session, configuration, and domain imports

### Exclude from core

- storefront mock products
- site-specific featured-product rules
- cart form actions
- product description presentation rules
- framework-specific redirects and headers

The `ideas` directory remains unshipped reference material until each reusable unit has tests in the new
package. No source file is copied wholesale.

## Testing Strategy

Unit tests cover:

- provider request construction and Zod parsing
- platform identifier mapping
- catalog sanitization
- package allowlists and variable-data policies
- basket correlation and trusted redirects
- player-auth state expiry, replay, and basket verification
- webhook signature validation using Tebex fixtures
- event-specific subject parsing
- payment, recurring, dispute, and entitlement state machines
- webhook leases, retries, idempotency, and dead-letter behavior
- organization and beneficiary authorization
- reconciliation logic

Better Auth plugin-kit integration tests cover:

- schema migration and export inference
- user and organization checkout creation
- session and origin enforcement
- FiveM player-auth redirect and callback
- secure opaque basket correlation
- payment completion granting an entitlement
- duplicate webhook delivery without duplicate grants
- refunds and disputes suspending/revoking grants
- recurring start, renewal, cancel-pending, cancellation abort, and end
- uncorrelated payment persistence without access
- worker authentication and bounded processing
- user/organization entitlement isolation

Provider HTTP is mocked at the network boundary. Time and randomness are injected. Existing idea tests
are migrated to exercise actual exported functions rather than duplicated test-only implementations.

Manual pre-release validation uses a Tebex test store or official webhook testing tools and covers
webhook validation, one FiveM-authenticated basket, payment completion, refund, recurring lifecycle, and
dead-letter retry. No live credentials enter fixtures or source control.

## Delivery Plan

### Phase 1: provider SDK extraction

- Scaffold `packages/tebex` with root, client, and server exports.
- Port runtime-neutral SDK types, schemas, requests, signature validation, and focused tests.
- Remove all application/framework coupling and validate package exports.

### Phase 2: Better Auth checkout

- Add schema and option validation.
- Implement user/organization ownership, package allowlists, basket persistence, and checkout endpoint.
- Implement Tebex player-auth state and callback.
- Add catalog and basket-status endpoints plus client inference.

### Phase 3: durable billing webhooks

- Add raw-body webhook verification, validation response, and idempotent delivery storage.
- Add protected leased worker processing and typed subject schemas.
- Persist payments and recurring payments.

### Phase 4: entitlements

- Implement package mappings and entitlement state transitions.
- Add access-check endpoints and server helpers.
- Add refunds, disputes, recurring cancellation, hooks, and organization isolation.

### Phase 5: reconciliation and release

- Add reconciliation, dead-letter inspection/retry, retention cleanup, and observability.
- Document Tebex keys, Headless setup, webhook setup, package mappings, FiveM identity, worker deployment,
  organization authorization, and entitlement policy.
- Run validation, security review, package dry-run, and live Tebex smoke tests.
- Add a Changeset only after live checkout and webhook verification succeed.

## Acceptance Criteria

- A signed-in user can purchase an allowed package through a Tebex Headless basket.
- FiveM stores can send users through Tebex player authentication and bind the authoritative returned
  identity to the initiating Better Auth user.
- A browser redirect or Tebex.js event cannot grant access.
- A valid `payment.completed` webhook is persisted once and grants configured entitlements once.
- Refunds, disputes, and recurring-payment endings produce deterministic access changes.
- Duplicate and retried webhooks do not duplicate payments or entitlements.
- Uncorrelated payments are retained for reconciliation and grant no access.
- User and organization billing records cannot cross authorization boundaries.
- No Tebex or worker secret, player identifier, basket identifier, or raw payment payload leaks through
  public endpoints or logs.
- The plugin is independent of Next.js, React, `@zstore`, and Homestead application code.
- The adapted SDK retains or improves the supplied test coverage.
- All repository tests, formatting, linting, type checks, builds, and package export checks pass.

## References

- [Better Auth Stripe plugin](https://www.better-auth.com/docs/plugins/stripe)
- [Tebex Headless API](https://docs.tebex.io/developers/headless-api/overview)
- [Tebex Headless authentication](https://docs.tebex.io/developers/headless-api/headers-and-authentication)
- [Tebex webhooks](https://docs.tebex.io/developers/webhooks/overview)
- [Tebex integration methods](https://docs.tebex.io/developers/integration-methods)
- [Tebex game-server API](https://docs.tebex.io/developers/game-server-api/overview)
