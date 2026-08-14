import { cfxClient } from "@itzdabbzz/better-auth-cfx/client";
import { steamClient } from "@itzdabbzz/better-auth-steam/client";
import { tebexClient } from "@itzdabbzz/better-auth-tebex/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [cfxClient(), steamClient(), tebexClient()],
});
