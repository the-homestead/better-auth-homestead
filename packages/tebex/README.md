# @homestead/ba-tebex

Tebex Headless checkout, billing records, recurring payments, and durable entitlements for Better
Auth.

> [!IMPORTANT]
> This package is private until its first live Tebex checkout and webhook flow has been verified. It
> is not available from npm yet.

## Server setup

```ts
import { betterAuth } from "better-auth";
import { tebex } from "@homestead/ba-tebex";

export const auth = betterAuth({
  trustedOrigins: ["https://app.example.com"],
  plugins: [
    tebex({
      publicToken: process.env.TEBEX_PUBLIC_TOKEN!,
      privateKey: process.env.TEBEX_PRIVATE_KEY!,
      webhookSecret: process.env.TEBEX_WEBHOOK_SECRET!,
      packageMappings: [{ packageId: 42, entitlements: ["supporter", "queue.priority"] }],
    }),
  ],
});
```

Keep the private key and webhook secret server-side. Apply your normal Better Auth schema migration
after installing the plugin; it adds customer, player identity, basket, payment, recurring payment,
entitlement, and webhook-delivery tables.

Configure Tebex to send webhooks to:

```text
https://app.example.com/api/auth/tebex/webhook
```

The route verifies Tebex's signature against the untouched request body, records every delivery,
and treats repeat delivery IDs as successful duplicates. Payment refunds and disputes revoke or
suspend mapped entitlements; won disputes restore them.

By default, webhook requests must also originate from Tebex's documented `18.209.80.3` or
`54.87.231.232` addresses. Configure Better Auth's `advanced.ipAddress` settings when the app runs
behind a trusted proxy. `webhookAllowedIPs` can replace the allowlist; set it to `false` only when a
gateway already enforces the source addresses.

## Client setup

```ts
import { createAuthClient } from "better-auth/client";
import { tebexClient } from "@homestead/ba-tebex/client";

export const authClient = createAuthClient({
  plugins: [tebexClient()],
});
```

Create a checkout for a signed-in user:

```ts
const result = await authClient.createTebexCheckout({
  callbackURL: "/billing/complete",
  cancelURL: "/billing/cancelled",
  packageId: 42,
  quantity: 1,
});

if (result.data?.url) window.location.assign(result.data.url);
```

Both URLs must match Better Auth's `trustedOrigins`. The package must appear in `packageMappings`,
which prevents clients from checking out arbitrary Tebex products through the plugin.

Query a user's persisted billing state through the inferred client methods:

```ts
const payments = await authClient.listTebexPayments();
const recurring = await authClient.listTebexRecurringPayments();
const entitlements = await authClient.listTebexEntitlements();
const supporter = await authClient.checkTebexEntitlement({ key: "supporter" });
```

## Player identity

Stores that can resolve a Tebex player identifier without the hosted authentication step can supply
`resolvePlayer`:

```ts
tebex({
  // credentials and mappings
  resolvePlayer: async ({ user }) => {
    const linked = await findLinkedFiveMAccount(user.id);
    return linked ? { field: "user_id", value: linked.cfxId } : null;
  },
});
```

Supported fields are `username`, `user_id`, and `discord_id`. Returning `null` lets Tebex provide its
player-authentication URL when the basket does not yet contain a checkout URL.

## Entitlement hook

Use `onEntitlementChanged` to project billing state into an application-owned cache, game-server
queue, or event bus. The database update completes before the hook runs.

```ts
tebex({
  // credentials and mappings
  onEntitlementChanged: async ({ customerId, event, projection }) => {
    await events.publish("billing.entitlements.changed", {
      customerId,
      deliveryId: event.id,
      entitlements: projection.entitlements,
    });
  },
});
```

Hook failures fail the delivery and are recorded on `tebexWebhookDelivery`, allowing the provider to
retry instead of acknowledging an incomplete projection.

## Endpoints

- `GET /tebex/store`
- `GET /tebex/categories`
- `GET /tebex/packages`
- `GET /tebex/package?packageId=:id`
- `POST /tebex/checkout`
- `GET /tebex/callback`
- `POST /tebex/webhook`
- `GET /tebex/payments`
- `GET /tebex/recurring-payments`
- `GET /tebex/entitlements`
- `POST /tebex/entitlements/check`

The catalog endpoints are public. Checkout and billing-state endpoints require a Better Auth
session. Mutating browser endpoints use Better Auth's origin checking.

## Current boundary

The first release targets Tebex Headless checkout and billing synchronization. Coupons, gift cards,
creator codes, CMS pages, tier mutation, and Tebex game-server command execution are not exposed by
this package yet.

## License

MIT © Homestead Systems
