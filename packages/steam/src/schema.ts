import type { BetterAuthPluginDBSchema } from "better-auth/db";

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
