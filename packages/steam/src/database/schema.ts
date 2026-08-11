import type { BetterAuthPluginDBSchema } from "better-auth/db";

/** Better Auth database extensions owned by the Steam plugin. */

export const steamSchema = {
  user: {
    fields: {
      steamId: {
        input: false,
        required: false,
        returned: true,
        type: "string",
        unique: true,
      },
    },
  },
} satisfies BetterAuthPluginDBSchema;
