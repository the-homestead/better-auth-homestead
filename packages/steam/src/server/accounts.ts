import type { GenericEndpointContext } from "better-auth";

export const STEAM_PROVIDER_ID = "steam";

export async function setSteamId(
  ctx: GenericEndpointContext,
  userId: string,
  steamId: string | null,
): Promise<void> {
  await ctx.context.adapter.update({
    model: "user",
    update: { steamId },
    where: [{ field: "id", value: userId }],
  });
}
