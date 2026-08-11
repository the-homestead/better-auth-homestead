import type { BetterAuthClientPlugin } from "better-auth/client";

import type { tebex } from "../server/index.js";

export const tebexClient = () =>
  ({
    id: "tebex",
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion, typescript/no-unsafe-type-assertion -- Better Auth client inference marker.
    $InferServerPlugin: {} as ReturnType<typeof tebex>,
    pathMethods: {
      "/tebex/checkout": "POST",
      "/tebex/entitlements/check": "POST",
    },
  }) satisfies BetterAuthClientPlugin;
