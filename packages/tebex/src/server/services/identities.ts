import type { GenericEndpointContext } from "better-auth";

import type { TebexBasket } from "../../provider/client.js";
import type { TebexPlayerIdentifier } from "../options.js";
import type { PlayerIdentityRecord } from "../records.js";

export async function persistPlayerIdentity(
  ctx: GenericEndpointContext,
  userId: string,
  identity: TebexPlayerIdentifier,
  source: "resolver" | "tebex-auth",
): Promise<PlayerIdentityRecord> {
  const existing = await ctx.context.adapter.findOne<PlayerIdentityRecord>({
    model: "tebexPlayerIdentity",
    where: [
      { field: "userId", value: userId },
      { field: "usernameType", value: identity.field },
    ],
  });
  const now = new Date();
  if (existing) {
    return (
      (await ctx.context.adapter.update<PlayerIdentityRecord>({
        model: "tebexPlayerIdentity",
        update: {
          identifier: identity.value,
          lastUsedAt: now,
          source,
          updatedAt: now,
          verifiedAt: now,
        },
        where: [{ field: "id", value: existing.id }],
      })) ?? existing
    );
  }
  return ctx.context.adapter.create<PlayerIdentityRecord>({
    model: "tebexPlayerIdentity",
    data: {
      createdAt: now,
      identifier: identity.value,
      lastUsedAt: now,
      source,
      updatedAt: now,
      userId,
      usernameType: identity.field,
      verifiedAt: now,
    },
  });
}

export function basketPlayerIdentity(basket: TebexBasket): TebexPlayerIdentifier | null {
  for (const field of ["user_id", "discord_id", "username"] as const) {
    const value = basket[field];
    if (typeof value === "string" && value.length > 0) return { field, value };
  }
  return null;
}
