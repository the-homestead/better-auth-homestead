import type { BetterAuthPlugin } from "better-auth";

/**
 * Creates the Homestead Steam plugin for Better Auth.
 *
 * @remarks The provider implementation has not been added to this scaffold yet.
 */
export function steam(): BetterAuthPlugin {
  return {
    id: "steam",
  } satisfies BetterAuthPlugin;
}
