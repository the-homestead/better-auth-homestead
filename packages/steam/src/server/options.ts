import type { User } from "better-auth";
import type { BetterAuthPluginDBSchema } from "better-auth/db";

import type { SteamProfile } from "../openid/client.js";

type UserMapping = Omit<Partial<User>, "id" | "createdAt" | "updatedAt">;

export interface SteamAuthPluginOptions {
  /** Steam Web API key from https://steamcommunity.com/dev/apikey. */
  steamApiKey: string;
  /** Enable explicit linking through `/link-social/steam`. */
  accountLinking?: boolean;
  /** Require `requestSignUp: true` before creating a new user. */
  disableImplicitSignUp?: boolean;
  /** Domain for Steam's synthetic account email. @default "steam.local" */
  syntheticEmailDomain?: string;
  /** Temporary single-use OpenID flow lifetime. @default 600 */
  flowTTLSeconds?: number;
  /** Reject sign-in instead of using a fallback profile when Steam's Web API is unavailable. */
  profileFailureMode?: "fallback" | "reject";
  /** Refresh the Better Auth user's display name and image on Steam sign-in. */
  updateUserInfoOnSignIn?: boolean;
  /** Customize Better Auth user fields after a Steam profile is loaded. */
  mapProfileToUser?: (profile: SteamProfile) => Promise<UserMapping> | UserMapping;
  /** Override or extend the `steamId` user field schema. */
  schema?: BetterAuthPluginDBSchema;
}

export function resolveSteamOptions(options: SteamAuthPluginOptions) {
  if (!options.steamApiKey.trim()) throw new Error("steamApiKey is required");
  const flowTTLSeconds = options.flowTTLSeconds ?? 10 * 60;
  if (!Number.isInteger(flowTTLSeconds) || flowTTLSeconds <= 0) {
    throw new Error("flowTTLSeconds must be a positive integer");
  }
  return {
    flowTTLSeconds,
    syntheticEmailDomain: options.syntheticEmailDomain?.trim() || "steam.local",
  };
}
