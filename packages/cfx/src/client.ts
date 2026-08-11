import type { BetterAuthClientPlugin } from "better-auth/client";

import type { cfx } from "./server.js";

export const cfxClient = () =>
  ({
    id: "cfx",
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion, typescript/no-unsafe-type-assertion -- Required Better Auth client inference marker.
    $InferServerPlugin: {} as ReturnType<typeof cfx>,
    pathMethods: {
      "/cfx/initiate": "POST",
      "/cfx/unlink": "POST",
    },
  }) satisfies BetterAuthClientPlugin;
