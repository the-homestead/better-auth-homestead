import { cfxClient } from "@homestead/ba-cfx/client";
import { steamClient } from "@homestead/ba-steam/client";
import { tebexClient } from "@homestead/ba-tebex/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [cfxClient(), steamClient(), tebexClient()],
});
