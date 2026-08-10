import type { BetterAuthPlugin } from "better-auth";

/**
 * Creates the Homestead Cfx plugin for Better Auth.
 *
 * @remarks The provider implementation has not been added to this scaffold yet.
 */
export function cfx(): BetterAuthPlugin {
  return {
    id: "cfx",
  } satisfies BetterAuthPlugin;
}
