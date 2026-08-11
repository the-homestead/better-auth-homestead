import type { BetterAuthPlugin } from "better-auth";

import { tebexSchema } from "../database/schema.js";
import { createTebexClient } from "../provider/client.js";
import { TEBEX_ERROR_CODES } from "../shared/error-codes.js";
import {
  DEFAULT_TEBEX_WEBHOOK_IPS,
  validateTebexOptions,
  type TebexPluginOptions,
} from "./options.js";
import { createBillingEndpoints } from "./routes/billing.js";
import { createCatalogEndpoints } from "./routes/catalog.js";
import { createCheckoutEndpoints } from "./routes/checkout.js";
import { createWebhookEndpoint } from "./routes/webhook.js";

export const tebex = (options: TebexPluginOptions) => {
  validateTebexOptions(options);
  const client = createTebexClient(options);
  const allowedIPs =
    options.webhookAllowedIPs === false
      ? false
      : (options.webhookAllowedIPs ?? DEFAULT_TEBEX_WEBHOOK_IPS);

  return {
    id: "tebex",
    schema: tebexSchema,
    endpoints: {
      ...createCatalogEndpoints(client),
      ...createCheckoutEndpoints(options, client, options.basketTTLSeconds ?? 30 * 60),
      receiveTebexWebhook: createWebhookEndpoint(options, allowedIPs),
      ...createBillingEndpoints(),
    },
    options,
    rateLimit: [
      { max: 10, pathMatcher: (path) => path === "/tebex/checkout", window: 60 },
      { max: 120, pathMatcher: (path) => path === "/tebex/webhook", window: 60 },
    ],
    $ERROR_CODES: TEBEX_ERROR_CODES,
  } satisfies BetterAuthPlugin;
};

export { TEBEX_ERROR_CODES } from "../shared/error-codes.js";
export type {
  TebexCheckoutContext,
  TebexEntitlementChange,
  TebexPlayerIdentifier,
  TebexPluginOptions,
} from "./options.js";
