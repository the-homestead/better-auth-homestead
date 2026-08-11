import type { BetterAuthClientPlugin } from "better-auth/client";

import type { steam } from "../server/index.js";

export const steamClient = () =>
  ({
    id: "steam",
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion, typescript/no-unsafe-type-assertion -- Required Better Auth client inference marker.
    $InferServerPlugin: {} as ReturnType<typeof steam>,
    pathMethods: {
      "/link-social/steam": "POST",
      "/sign-in/steam": "POST",
      "/unlink-social/steam": "POST",
    },
  }) satisfies BetterAuthClientPlugin;
