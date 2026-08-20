# @homestead/ba-steam

Steam OpenID sign-in, account linking, and profile synchronization for Better Auth.

> [!IMPORTANT]
> This package is still private while its first live Steam flow is verified and release metadata is
> prepared. It is not available from npm yet.

## Server setup

```ts
import { betterAuth } from "better-auth";
import { steam } from "@homestead/ba-steam";

export const auth = betterAuth({
  trustedOrigins: ["https://app.example.com"],
  plugins: [
    steam({
      steamApiKey: process.env.STEAM_API_KEY!,
      accountLinking: true,
    }),
  ],
});
```

Obtain the API key from Steam and keep it server-side. The plugin adds a unique, read-only `steamId`
field to Better Auth's user model, so apply your normal Better Auth schema migration after installing
it.

## Client setup

```ts
import { createAuthClient } from "better-auth/client";
import { steamClient } from "@homestead/ba-steam/client";

export const authClient = createAuthClient({
  plugins: [steamClient()],
});
```

Start sign-in through the inferred client endpoint. An email address is not required:

```ts
await authClient.signInWithSteam({
  callbackURL: "/account",
  errorCallbackURL: "/sign-in/error",
  newUserCallbackURL: "/welcome",
});
```

The response contains Steam's authorization URL. Unless `disableRedirect` is set, Better Auth's
client follows it automatically.

Link or unlink Steam from an authenticated account:

```ts
await authClient.linkAccountWithSteam({ callbackURL: "/settings/accounts" });
await authClient.unlinkSteamAccount({});
```

## Options

- `steamApiKey` — required Steam Web API key.
- `accountLinking` — enables the authenticated `/link-social/steam` endpoint.
- `disableImplicitSignUp` — requires `requestSignUp: true` before creating a new user.
- `syntheticEmailDomain` — domain used for the generated internal email; defaults to `steam.local`.
- `flowTTLSeconds` — lifetime of a single-use OpenID flow; defaults to 600 seconds.
- `profileFailureMode` — `fallback` continues safely if Steam's profile API is unavailable;
  `reject` aborts the flow.
- `updateUserInfoOnSignIn` — refreshes the user's display name and image on sign-in.
- `mapProfileToUser` — maps a validated Steam profile into allowed Better Auth user fields for new
  users.
- `schema` — extends or overrides the plugin's Better Auth database schema.

Callback, new-user, and error destinations must match Better Auth `trustedOrigins`. Exact origins and
wildcard subdomains such as `https://*.example.com` are supported; wildcard patterns do not match the
apex domain.

OpenID flow state is random, stored server-side, expires automatically, and is consumed on first use.
The callback also verifies Steam's signed `return_to`, provider endpoint, response signature, and
SteamID64 format before creating a session.

## Endpoints

- `POST /sign-in/steam`
- `GET /steam/callback`
- `POST /link-social/steam`
- `POST /unlink-social/steam`

## License

MIT © Homestead Systems
