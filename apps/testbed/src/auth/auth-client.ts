import { cfxClient } from "@homestead-systems/ba-cfx/client";
import { steamClient } from "@homestead-systems/ba-steam/client";
import { tebexClient } from "@homestead-systems/ba-tebex/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [cfxClient(), steamClient(), tebexClient()],
});
