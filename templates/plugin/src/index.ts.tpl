import type { BetterAuthPlugin } from "better-auth";

/**
 * Creates the Homestead {{PLUGIN_DISPLAY_NAME}} plugin for Better Auth.
 *
 * @remarks The provider implementation has not been added to this scaffold yet.
 */
export function {{PLUGIN_FUNCTION_NAME}}(): BetterAuthPlugin {
  return {
    id: "{{PLUGIN_NAME}}",
  } satisfies BetterAuthPlugin;
}
