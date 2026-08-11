# @itzdabbzz/better-auth-steam

Steam OpenID sign-in and account linking for Better Auth.

> [!IMPORTANT]
> This package is still private while its first live Steam flow is verified and release metadata is
> prepared. It is not available from npm yet.

## Server setup

```ts
import { betterAuth } from "better-auth";
import { steam } from "@itzdabbzz/better-auth-steam";

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

Obtain the API key from Steam and keep it server-side. Consumers initiate sign-in with a `POST` to
the Better Auth endpoint:

```ts
await fetch("/api/auth/sign-in/steam", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    email: "player@example.com",
    callbackURL: "/account",
  }),
});
```

## Options

- `steamApiKey` — required Steam Web API key.
- `accountLinking` — enables the authenticated `/link-social/steam` endpoint.
- `disableImplicitSignUp` — requires `requestSignUp: true` before creating a new user.
- `mapProfileToUser` — maps a validated Steam profile into allowed Better Auth user fields.

Callback, new-user, and error destinations must match Better Auth `trustedOrigins`. Exact origins and
wildcard subdomains such as `https://*.example.com` are supported; wildcard patterns do not match the
apex domain.

## Endpoints

- `POST /sign-in/steam`
- `GET /steam/callback`
- `POST /link-social/steam`

## License

MIT © ItzDabbzz
