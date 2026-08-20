# @homestead/ba-cfx

Cfx.re account authentication and linking for Better Auth using Discourse User API Keys.

> [!IMPORTANT]
> This package is still private while its first live Cfx.re flow is verified and release metadata is
> prepared. It is not available from npm yet.

## Server setup

```ts
import { betterAuth } from "better-auth";
import { cfx } from "@homestead/ba-cfx";

export const auth = betterAuth({
  trustedOrigins: ["https://app.example.com"],
  plugins: [
    cfx({
      applicationName: "My Community",
      successCallbackURL: "/account",
      errorCallbackURL: "/login",
      scopes: ["session_info", "read"],
    }),
  ],
});
```

The plugin adds a `cfxAccount` model. Apply the schema through the same Better Auth migration or
schema-generation workflow used by the host application before enabling the plugin.

## Client setup

```ts
import { createAuthClient } from "better-auth/client";
import { cfxClient } from "@homestead/ba-cfx/client";

export const authClient = createAuthClient({
  plugins: [cfxClient()],
});
```

The client plugin infers the server endpoints and marks initiate/unlink operations as `POST`.

## Options

- `forumUrl` — defaults to `CFX_FORUM_URL` or `https://forum.cfx.re`.
- `applicationName` — authorization-screen name; defaults to `CFX_APP_NAME`.
- `successCallbackURL` and `errorCallbackURL` — trusted post-flow destinations.
- `scopes` — defaults to `session_info`; include `read` when profile email fallback is needed.
- `flowTTLSeconds` — temporary authorization-flow lifetime; defaults to ten minutes.
- `disableSignUp` — prevents new Better Auth users.
- `allowImplicitLinking` — permits matching an existing user by email; disabled by default.
- `updateUserInfoOnSignIn` — refreshes the user's name and image.
- `revokeKeyOnUnlink` — revokes the remote key; enabled by default.
- `mapProfileToUser` — maps the Cfx.re profile into allowed Better Auth user fields.

Temporary flow state is encrypted with the Better Auth secret. Stored Cfx.re API keys are encrypted
at rest, callback state is single-use, and redirect destinations use Better Auth trusted-origin
validation.

## Endpoints

- `POST /cfx/initiate`
- `GET /cfx/callback`
- `GET /cfx/status`
- `POST /cfx/unlink`

## License

MIT © Homestead Systems
