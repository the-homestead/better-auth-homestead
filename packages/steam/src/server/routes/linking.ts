import {
  APIError,
  createAuthEndpoint,
  originCheckMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import { z } from "zod";

import { buildSteamOpenIDURL } from "../../openid/client.js";
import { setSteamId, STEAM_PROVIDER_ID } from "../accounts.js";
import { createFlow, linkBodySchema, trustedRedirect } from "../flow.js";
import type { SteamAuthPluginOptions } from "../options.js";

export function createLinkingEndpoints(options: SteamAuthPluginOptions, flowTTLSeconds: number) {
  return {
    linkAccountWithSteam: createAuthEndpoint(
      "/link-social/steam",
      {
        body: linkBodySchema,
        method: "POST",
        requireHeaders: true,
        use: [originCheckMiddleware, sessionMiddleware],
      },
      async (ctx) => {
        if (!options.accountLinking) {
          throw new APIError("FORBIDDEN", { message: "Steam account linking is disabled" });
        }
        const callbackURL = trustedRedirect(ctx, ctx.body.callbackURL, "/");
        const errorCallbackURL = trustedRedirect(ctx, ctx.body.errorCallbackURL, "/error");
        const stateId = await createFlow(
          ctx,
          {
            callbackURL,
            errorCallbackURL,
            mode: "link",
            newUserCallbackURL: callbackURL,
            requestSignUp: false,
            userId: ctx.context.session.user.id,
          },
          flowTTLSeconds,
        );
        const returnTo = `${ctx.context.baseURL}/steam/callback?state=${encodeURIComponent(stateId)}`;
        const url = buildSteamOpenIDURL(new URL(ctx.context.baseURL).origin, returnTo).toString();
        return ctx.json({ redirect: !ctx.body.disableRedirect, url });
      },
    ),
    unlinkSteamAccount: createAuthEndpoint(
      "/unlink-social/steam",
      {
        body: z.object({}),
        method: "POST",
        requireHeaders: true,
        use: [originCheckMiddleware, sessionMiddleware],
      },
      async (ctx) => {
        if (!options.accountLinking) {
          throw new APIError("FORBIDDEN", { message: "Steam account linking is disabled" });
        }
        const accounts = await ctx.context.internalAdapter.findAccounts(
          ctx.context.session.user.id,
        );
        const account = accounts.find(({ providerId }) => providerId === STEAM_PROVIDER_ID);
        if (!account) return ctx.json({ success: true });
        if (
          accounts.length <= 1 &&
          ctx.context.options.account?.accountLinking?.allowUnlinkingAll !== true
        ) {
          throw new APIError("BAD_REQUEST", {
            message: "You cannot unlink the user's only sign-in method",
          });
        }
        await ctx.context.internalAdapter.deleteAccount(account.id);
        await setSteamId(ctx, ctx.context.session.user.id, null);
        return ctx.json({ success: true });
      },
    ),
  };
}
