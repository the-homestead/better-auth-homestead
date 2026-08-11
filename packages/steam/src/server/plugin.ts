import type { BetterAuthPlugin } from "better-auth";
import { mergeSchema } from "better-auth/db";

import { steamSchema } from "../database/schema.js";
import { STEAM_ERROR_CODES } from "../shared/error-codes.js";
import { STEAM_PROVIDER_ID } from "./accounts.js";
import { resolveSteamOptions, type SteamAuthPluginOptions } from "./options.js";
import { createAuthenticationEndpoints } from "./routes/authentication.js";
import { createLinkingEndpoints } from "./routes/linking.js";

export const steam = (options: SteamAuthPluginOptions) => {
  const { flowTTLSeconds, syntheticEmailDomain } = resolveSteamOptions(options);
  return {
    id: STEAM_PROVIDER_ID,
    schema: mergeSchema(steamSchema, options.schema),
    endpoints: {
      ...createAuthenticationEndpoints(options, flowTTLSeconds, syntheticEmailDomain),
      ...createLinkingEndpoints(options, flowTTLSeconds),
    },
    options,
    rateLimit: [
      { max: 10, pathMatcher: (path) => path === "/sign-in/steam", window: 60 },
      { max: 20, pathMatcher: (path) => path === "/steam/callback", window: 60 },
    ],
    $ERROR_CODES: STEAM_ERROR_CODES,
  } satisfies BetterAuthPlugin;
};

export type { SteamAuthPluginOptions } from "./options.js";
