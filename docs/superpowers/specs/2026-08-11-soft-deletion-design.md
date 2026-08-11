# Homestead Soft Deletion Plugin Design

**Status:** Approved direction; pending implementation plan
**Package:** `@itzdabbzz/better-auth-soft-deletion`
**Plugin ID:** `soft-deletion`

## Summary

Create a Better Auth plugin that provides recoverable account deletion without intercepting the core
hard-delete sequence. A soft-deleted user keeps their reserved identity during a configurable recovery
window, cannot create new sessions, loses all existing sessions immediately, and can restore access
through a single-use verified-email flow. After the recovery window, a protected purge worker invokes
Better Auth's normal hard-delete operation so accounts, sessions, and the user row are removed through
the framework's supported lifecycle.

The plugin owns authentication state and deletion lifecycle only. Consumers remain responsible for
domain data such as projects, posts, purchases, audit records, and legal holds through typed lifecycle
hooks.

## Goals

- Provide one consistent deletion policy for password, OAuth, passkey, Steam, CFX, and future accounts.
- Reserve the user's email and provider identities throughout the recovery window.
- Revoke database and secondary-storage sessions as soon as deletion is confirmed.
- Prevent every authentication method from creating a session for a deleted user.
- Restore any recoverable account through verified email, regardless of its original sign-in method.
- Permanently purge expired accounts through Better Auth's supported internal deletion lifecycle.
- Support consumers with typed deletion, restoration, and purge hooks.
- Avoid email enumeration, token leakage, and deletion/restore race conditions.
- Work across Better Auth database adapters supported by the Homestead plugin test kit.

## Non-goals

- Replacing administrative suspension, banning, or moderation status.
- Retaining an account indefinitely after its recovery deadline.
- Automatically deleting consumer-owned domain data without consumer hooks.
- Restoring an account after permanent purge.
- Preserving live OAuth access or refresh tokens while an account is deleted.
- Providing legal-hold or compliance-case management in the first release.
- Hijacking Better Auth's built-in `/delete-user` endpoint or its database delete hooks.

## Approaches Considered

### Selected: dedicated soft-deletion lifecycle

The plugin exposes its own request, confirmation, restore, and purge operations. Soft deletion updates
the user, strips provider tokens, and revokes sessions. Permanent purge later calls Better Auth's normal
hard-delete method.

This separates a reversible state transition from an irreversible delete operation and avoids relying
on hook ordering inside Better Auth's hard-delete sequence.

### Rejected: cancel hard deletion from a user database hook

The reference implementation waits for Better Auth's user-delete database hook, updates the row, and
returns `false`. Better Auth's internal hard-delete lifecycle revokes sessions and deletes linked
accounts before deleting the user row, so a user hook is too late to preserve the complete account.
Selective account-delete hooks are brittle and can lose OAuth, passkey, or future plugin state.

### Rejected: anonymize immediately and permit re-registration

Immediate anonymization makes verified restoration harder, permits duplicate identities, and breaks
provider-account linking. The selected design keeps the minimum identity needed for recovery until the
published purge deadline, then performs permanent deletion.

## Better Auth Integration Rules

The plugin uses Better Auth facilities rather than duplicating them:

- plugin schema for inferred user fields
- `createAuthEndpoint` and a separate client inference plugin
- session and sensitive-session middleware for authenticated deletion requests
- origin middleware and Better Auth trusted-origin validation for callback URLs
- the verification model for expiring, single-use confirmation tokens
- the internal adapter for session revocation, account updates, and final user deletion
- plugin database hooks to block session creation for deleted users
- plugin rate limits with stable structured error codes
- Better Auth logging rather than direct console output

Consumers must leave Better Auth's built-in `user.deleteUser.enabled` disabled. Enabling both creates an
intentional hard-delete path outside the plugin. Initialization fails with an actionable error when the
plugin detects that conflicting configuration.

The plugin also rejects Better Auth's known self-service and admin hard-delete routes in a before hook.
This prevents another installed plugin from exposing an accidental bypass. Trusted server code can
still call Better Auth's internal adapter directly, so applications must treat direct adapter access as
an irreversible privileged operation.

Administrative banning remains separate and compatible. The plugin does not introduce a generic
`status` field that could collide with another user-state system.

## User Schema

The plugin extends the Better Auth `user` model with namespaced fields:

- `softDeletedAt`: nullable date
- `softDeletePurgeAt`: nullable date
- `softDeleteReason`: nullable bounded string
- `softDeleteRequestedAt`: nullable date
- `softDeleteVersion`: integer used for optimistic lifecycle transitions

All lifecycle fields are `input: false` and `returned: false`. Plugin endpoints return only the minimum
safe state intended for their caller. Trusted server helpers read lifecycle fields directly through the
adapter.

A user is active when `softDeletedAt` is null. A user is recoverable when `softDeletedAt` is set and
`softDeletePurgeAt` is later than the current time. A user is purgeable when the purge deadline has
passed.

The original email remains on the unique user row during recovery. This naturally blocks
re-registration without a separate blocked-email table. Provider account identifiers also remain, so a
new social login cannot create a duplicate user.

## Configuration

```ts
softDeletion({
  retentionDays: 30,
  deletionTokenTTLSeconds: 30 * 60,
  restoreTokenTTLSeconds: 30 * 60,
  purgeWorkerSecret: process.env.SOFT_DELETION_WORKER_SECRET!,
  sendDeletionConfirmation: async ({ user, url, purgeAt }) => {},
  sendRestoreConfirmation: async ({ user, url, purgeAt }) => {},
  resolveRecoveryEmail: async (user) => (user.emailVerified ? user.email : null),
  hooks: {
    beforeSoftDelete: async ({ user, purgeAt }) => {},
    afterSoftDelete: async ({ user, purgeAt }) => {},
    beforeRestore: async ({ user }) => {},
    afterRestore: async ({ user }) => {},
    beforePurge: async ({ user }) => {},
    afterPurge: async ({ userId }) => {},
  },
});
```

Required options:

- `sendDeletionConfirmation`
- `sendRestoreConfirmation`
- `purgeWorkerSecret`

Optional policy:

- recovery duration
- token lifetimes
- maximum purge batch size
- provider-token cleanup behavior, defaulting to removal
- safe reason capture, disabled by default
- recovery-email resolution, defaulting to the verified Better Auth user email
- lifecycle hooks
- custom schema field names where Better Auth supports mapping

All secrets and email delivery functions are server-only. The package never sends email directly or
assumes a particular email provider.

## Package Surface

```text
@itzdabbzz/better-auth-soft-deletion
@itzdabbzz/better-auth-soft-deletion/client
@itzdabbzz/better-auth-soft-deletion/server
```

The root export contains the plugin, options, schema, lifecycle types, and error codes. The client
export contains Better Auth inference and path methods. The server export contains guarded helpers for
administrative workflows and purge scheduling and must not be imported by browser bundles.

## Deletion Flow

Deletion uses two steps so all authentication methods receive the same proof-of-control requirement.

### 1. Request deletion

`POST /soft-deletion/request`

- Requires a current sensitive Better Auth session.
- Accepts trusted `callbackURL`, trusted `errorCallbackURL`, and an optional bounded reason.
- Returns the same success response if a request is already pending.
- Generates a high-entropy random token.
- Stores only a SHA-256 token identifier and serialized request metadata in Better Auth's verification
  table.
- Sends a confirmation URL through `sendDeletionConfirmation`.
- Does not delete or revoke anything yet.

### 2. Confirm deletion

`POST /soft-deletion/confirm`

- Requires the raw token and a current session belonging to the token's user.
- Atomically consumes the token, so replay fails.
- Rejects expired tokens and lifecycle-version mismatches.
- Sets `softDeletedAt`, `softDeletePurgeAt`, and a new lifecycle version.
- Removes OAuth access tokens, refresh tokens, ID tokens, token expirations, and scopes from linked
  account rows while retaining provider and account identifiers.
- Revokes every user session through Better Auth's internal adapter, including secondary storage.
- Runs `afterSoftDelete` only after the authentication state is committed.
- Clears the current session cookie and redirects to the trusted callback when requested.

Credential password hashes remain so the identity record stays intact, but password possession alone
does not restore the account. Passkey and plugin-owned credentials remain linked but cannot create a
session while the user is deleted.

Repeated deletion confirmation is idempotent when it targets the same lifecycle version. A newly
issued request is required after an account has been restored.

## Authentication Blocking

The canonical enforcement point is session creation, not individual sign-in routes. The plugin adds a
`session.create.before` database hook that resolves the target user and rejects session creation when
`softDeletedAt` is set. This covers password, OAuth, passkey, Steam, CFX, magic link, and future Better
Auth providers that create normal sessions.

Route-specific hooks may return earlier, friendlier errors for known email sign-in paths, but they are
not security boundaries. The session hook is authoritative.

Deletion confirmation revokes all existing sessions before returning. Strict immediate invalidation
is incompatible with a stale session cookie cache that bypasses storage. By default, initialization
rejects Better Auth configurations with session cookie caching enabled. Consumers may explicitly opt
into bounded cache staleness with `allowCookieCache: true`; documentation must state the exact maximum
staleness implied by their Better Auth cache settings.

Errors shown during ordinary sign-in remain generic. The API does not disclose whether a submitted
email belongs to a deleted account.

## Restore Flow

Restoration is email-based so it works for credential and non-credential users.

### 1. Request restoration

`POST /soft-deletion/restore/request`

- Accepts an email and trusted callback URLs.
- Is rate-limited by IP and a keyed hash of normalized email.
- Always returns the same accepted response, whether the user is missing, active, expired, or
  recoverable.
- For a recoverable user, stores a hashed, single-use restore token in the verification table and calls
  `sendRestoreConfirmation`.
- Does not issue a session or reveal the recovery deadline in the public response.

### 2. Confirm restoration

`POST /soft-deletion/restore/confirm`

- Accepts the raw token; no existing session is required.
- Atomically consumes the token and validates its user, purpose, expiry, purge deadline, and lifecycle
  version.
- Conditionally clears `softDeletedAt`, `softDeletePurgeAt`, `softDeleteRequestedAt`, and reason.
- Increments the lifecycle version so older deletion and restore links cannot be reused.
- Runs `afterRestore` after commit.
- Does not automatically create a session.

After restoration, the user signs in normally. Social providers whose tokens were stripped perform a
normal reauthorization during sign-in. Not creating a session from the email link keeps restoration
separate from authentication and lets Better Auth apply the provider's normal checks.

Restore confirmation and permanent purge compete through the lifecycle version and a conditional user
update. Once purge has claimed an expired user, restoration fails closed.

## Permanent Purge

`POST /soft-deletion/internal/purge`

- Requires `Authorization: Bearer <purgeWorkerSecret>` using constant-time comparison.
- Is not part of the browser client plugin.
- Selects a bounded batch where `softDeletePurgeAt <= now`.
- Claims each candidate with an expiring lease and lifecycle version.
- Runs `beforePurge`; a failure releases or expires the lease for retry.
- Calls Better Auth's internal `deleteUser(userId)` method, allowing Better Auth to remove sessions,
  linked accounts, and the user through its normal database hooks and cascade rules.
- Runs `afterPurge` as best-effort notification with only the deleted user ID and purge timestamp.
- Returns aggregate counts without user data.

Purge uses at-least-once worker semantics. `beforePurge` must be idempotent. Cleanup that must finish
before identity removal belongs in `beforePurge`; `afterPurge` is observational because the user has
already been irreversibly removed.

The user schema includes private purge-lease fields if the adapter cannot provide row locks:

- `softDeletePurgeLeaseId`
- `softDeletePurgeLeaseExpiresAt`
- `softDeletePurgeAttempts`

A failed candidate records only a bounded, sanitized error and retry timestamp. Repeated failures use
exponential backoff and become visible through server-side inspection helpers; they never silently
convert into a successful purge.

## Consumer Lifecycle Hooks

- `beforeSoftDelete`: validate domain rules before confirmation is committed
- `afterSoftDelete`: disable consumer-owned access and queue reversible cleanup
- `beforeRestore`: validate restoration policy before the user becomes active
- `afterRestore`: reactivate consumer-owned records where appropriate
- `beforePurge`: permanently remove or anonymize consumer data that must not outlive the user
- `afterPurge`: audit or telemetry notification without user PII

`beforeSoftDelete` and `beforeRestore` may reject the transition with a stable application error.
`afterSoftDelete` and `afterRestore` failures are logged and exposed to server observability but do not
roll back authentication state. `beforePurge` failures block permanent deletion and retry. Hook contexts
contain the minimum data required for their stage.

## Server Helpers

The server-only entry exports typed operations for trusted administrative tooling:

- `requestUserSoftDeletion`
- `restoreSoftDeletedUser`
- `getSoftDeletionState`
- `listPurgeFailures`
- `retryUserPurge`

These helpers require an initialized plugin service and never bypass lifecycle hooks. They do not
define admin authorization; the consuming application must authorize its own administrative calls.

No public endpoint permits an administrator to restore or purge an arbitrary user.

## Error Model

Stable plugin errors include:

- `SOFT_DELETION_ALREADY_PENDING`
- `SOFT_DELETION_CONFIRMATION_EXPIRED`
- `SOFT_DELETION_CONFIRMATION_INVALID`
- `SOFT_DELETION_SESSION_REQUIRED`
- `SOFT_DELETION_RECOVERY_EMAIL_REQUIRED`
- `SOFT_DELETION_ACCOUNT_UNAVAILABLE`
- `SOFT_DELETION_RESTORE_INVALID`
- `SOFT_DELETION_RESTORE_EXPIRED`
- `SOFT_DELETION_RETENTION_EXPIRED`
- `SOFT_DELETION_RATE_LIMITED`
- `SOFT_DELETION_WORKER_UNAUTHORIZED`
- `SOFT_DELETION_PURGE_FAILED`
- `SOFT_DELETION_CONFIGURATION_INVALID`

Restore request responses remain generic and do not use account-specific errors. Confirmation errors
do not include email, user ID, provider names, or token values. Server logs redact tokens and normalize
hook failures.

## Security Requirements

- Generate deletion and restore tokens with at least 256 bits of randomness.
- Persist only token hashes and compare fixed-length values safely.
- Bind deletion confirmation to the initiating user, session, purpose, lifecycle version, and expiry.
- Consume verification records atomically when the adapter supports it; otherwise delete before
  executing the transition and fail closed.
- Validate callback and error URLs with Better Auth trusted origins.
- Require sensitive-session middleware before sending a deletion link.
- Require a deliverable, verified recovery email before deletion can be confirmed.
- Revoke sessions from primary and secondary storage on confirmation.
- Block session creation centrally for every deleted user.
- Strip provider bearer tokens at deletion and never return credential fields.
- Normalize email consistently with Better Auth before lookups and rate-limit keys.
- Use generic restoration request responses to resist account-state enumeration.
- Use conditional lifecycle-version updates to prevent restore/purge races.
- Keep purge credentials server-only and use constant-time authorization checks.
- Bound stored reasons, errors, email metadata, request bodies, and batch sizes.

## Data Retention and Privacy

The recovery email, linked identity records, and credential verifier remain only until `softDeletePurgeAt`.
This retention is explicit and shown to the user before confirmation. OAuth bearer tokens are removed
immediately. Consumer documentation must explain that installing the plugin does not automatically
delete application-owned domain data.

The default recovery window is 30 days. Retention is calculated from confirmed deletion, not the initial
request. Changing configuration does not retroactively move deadlines already persisted on users.

Expired verification entries may be removed by normal Better Auth cleanup. The purge worker removes the
user through Better Auth and leaves no plugin-owned blocked-identifier record behind.

Better Auth accounts whose primary email is synthetic or unverified, including a default Steam-only
account, must add and verify a real email before requesting deletion. The plugin checks
`emailVerified === true` and permits an optional `resolveRecoveryEmail(user)` policy for consumers that
maintain a separate verified recovery address. It never sends recovery links to generated domains such
as `steam.local`.

## Testing Strategy

Unit tests cover:

- configuration validation
- deadline calculation across time zones and daylight-saving boundaries
- token hashing, purpose binding, expiry, and replay rejection
- trusted callback validation
- lifecycle-version transitions and idempotency
- provider-token sanitization
- purge lease acquisition, expiry, retry, and backoff
- generic restore responses and rate-limit keys
- cookie-cache compatibility enforcement

Better Auth plugin-kit integration tests cover:

- schema migration and inferred private fields
- deletion request and confirmation
- sensitive-session enforcement
- revocation of all user sessions
- session-creation blocking for password, social, and custom providers
- preservation of credential and provider identity records during recovery
- removal of provider bearer tokens
- email reservation during retention
- email restoration for credential and OAuth-only users
- no automatic session after restoration
- deletion/restore token replay
- concurrent restore and purge attempts
- final purge through Better Auth's internal adapter
- consumer hook ordering and failure behavior
- secondary session storage when supported by the test harness

Provider and email delivery are mocked at their boundaries. Time uses an injected clock. Purge tests use
small batches and deterministic leases. A manual pre-release check covers cookie cache rejection, one
password account, one OAuth account, one custom-provider account, restoration, and permanent purge.

## Delivery Plan

### Phase 1: package foundation

- Scaffold `packages/soft-deletion` with root, client, and server exports.
- Define schema, option validation, lifecycle types, stable error codes, and clock/token utilities.
- Add Better Auth plugin-kit migration and endpoint-registration tests.

### Phase 2: deletion lifecycle

- Add sensitive deletion request and single-use confirmation endpoints.
- Implement user transition, provider-token stripping, session revocation, and session-creation blocking.
- Add trusted redirects, lifecycle hooks, and client inference.

### Phase 3: universal restoration

- Add enumeration-resistant restore requests and verified-email delivery.
- Add token confirmation, conditional restoration, lifecycle versioning, and normal sign-in handoff.
- Test credential, OAuth-only, and Homestead custom-provider users.

### Phase 4: permanent purge

- Add purge leases, protected worker endpoint, bounded batching, retries, and inspection helpers.
- Purge through Better Auth's internal adapter and test consumer cleanup hooks.

### Phase 5: release readiness

- Document migrations, Better Auth configuration, email templates, cron deployment, cookie-cache policy,
  retention language, provider reauthorization, and consumer data cleanup.
- Run repository validation, package dry-run, security review, and live adapter smoke tests.
- Add a Changeset only after deletion, restoration, and purge pass manual verification.

## Acceptance Criteria

- A user can request and confirm deletion without exposing a separate hard-delete path.
- An account without a deliverable verified recovery email cannot enter a supposedly recoverable state.
- Confirmation immediately prevents new sessions and revokes existing stored sessions.
- Password, OAuth, passkey, Steam, CFX, and future normal session providers share the same enforcement.
- The email and provider identities remain reserved until the persisted purge deadline.
- OAuth bearer tokens are removed immediately while stable provider identifiers remain linked.
- A recoverable user can restore through a single-use email link without a password.
- Restore requests do not reveal whether an email exists or is deleted.
- Restoration never creates a session; the user authenticates normally afterward.
- Expired users are permanently removed through Better Auth's standard internal deletion lifecycle.
- Concurrent deletion, restoration, and purge operations cannot reactivate an already purged identity.
- Consumer cleanup can block purge through an idempotent `beforePurge` hook.
- The plugin rejects incompatible hard-delete and strict cookie-cache configurations at startup.
- All tests, formatting, linting, type checks, builds, and package export checks pass.

## References

- [Better Auth user deletion](https://www.better-auth.com/docs/concepts/users-accounts#delete-user)
- [Better Auth database hooks](https://www.better-auth.com/docs/concepts/database#database-hooks)
- [Better Auth plugin schema](https://www.better-auth.com/docs/concepts/plugins#schema)
- [ForgeHustle soft deletion reference](https://github.com/forgehustle/better-auth-soft-deletion)
