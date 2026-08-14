import type { User } from "better-auth";
import { createAuthEndpoint, getSessionFromCtx, originCheckMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

import {
  buildSteamOpenIDURL,
  fetchSteamProfile,
  verifySteamOpenIDResponse,
} from "../../openid/client.js";
import { STEAM_ERROR_CODES } from "../../shared/error-codes.js";
import { setSteamId, STEAM_PROVIDER_ID } from "../accounts.js";
import {
  appendQuery,
  callbackQuerySchema,
  consumeFlow,
  createFlow,
  initiateBodySchema,
  openIDParams,
  trustedRedirect,
} from "../flow.js";
import type { SteamAuthPluginOptions } from "../options.js";

export function createAuthenticationEndpoints(
  options: SteamAuthPluginOptions,
  flowTTLSeconds: number,
  syntheticEmailDomain: string,
) {
  return {
    signInWithSteam: createAuthEndpoint(
      "/sign-in/steam",
      {
        body: initiateBodySchema,
        method: "POST",
        requireHeaders: true,
        use: [originCheckMiddleware],
        metadata: { openapi: { description: "Start Steam OpenID authentication" } },
      },
      async (ctx) => {
        const callbackURL = trustedRedirect(ctx, ctx.body.callbackURL, "/");
        const errorCallbackURL = trustedRedirect(ctx, ctx.body.errorCallbackURL, "/error");
        const newUserCallbackURL = trustedRedirect(ctx, ctx.body.newUserCallbackURL, callbackURL);
        const stateId = await createFlow(
          ctx,
          {
            callbackURL,
            errorCallbackURL,
            mode: "sign-in",
            newUserCallbackURL,
            requestSignUp: ctx.body.requestSignUp === true,
          },
          flowTTLSeconds,
        );
        const returnTo = `${ctx.context.baseURL}/steam/callback?state=${encodeURIComponent(stateId)}`;
        const url = buildSteamOpenIDURL(
          new URL(ctx.context.baseURL).origin,
          returnTo,
          options.provider,
        ).toString();
        return ctx.json({ redirect: !ctx.body.disableRedirect, url });
      },
    ),
    steamCallback: createAuthEndpoint(
      "/steam/callback",
      {
        metadata: {
          client: false,
          openapi: { description: "Complete Steam OpenID authentication" },
        },
        method: "GET",
        query: callbackQuerySchema,
        requireHeaders: true,
      },
      async (ctx) => {
        const fallbackErrorURL = new URL("/error", ctx.context.baseURL).toString();
        const state = await consumeFlow(ctx, ctx.query.state).catch((error: unknown) => {
          ctx.context.logger.error("Steam flow state could not be consumed", { error });
          return null;
        });
        if (!state) {
          throw ctx.redirect(
            appendQuery(fallbackErrorURL, ctx.context.baseURL, {
              error: "STEAM_FLOW_EXPIRED",
            }),
          );
        }

        const redirectError = (code: keyof typeof STEAM_ERROR_CODES): never => {
          throw ctx.redirect(
            appendQuery(state.errorCallbackURL, ctx.context.baseURL, { error: code }),
          );
        };

        trustedRedirect(ctx, state.callbackURL, "/");
        trustedRedirect(ctx, state.errorCallbackURL, "/error");
        trustedRedirect(ctx, state.newUserCallbackURL, state.callbackURL);

        const expectedReturnTo = `${ctx.context.baseURL}/steam/callback?state=${encodeURIComponent(ctx.query.state)}`;
        if (ctx.query["openid.return_to"] !== expectedReturnTo) {
          return redirectError("STEAM_VERIFICATION_FAILED");
        }

        const steamId = await verifySteamOpenIDResponse(
          openIDParams(ctx.query),
          options.provider,
        ).catch((error: unknown) => {
          ctx.context.logger.error("Steam OpenID verification failed", { error });
          return null;
        });
        if (!steamId) return redirectError("STEAM_VERIFICATION_FAILED");

        const profile = await fetchSteamProfile(
          options.steamApiKey,
          steamId,
          options.provider,
        ).catch((error: unknown) => {
          ctx.context.logger.warn("Steam profile request failed", { error });
          return null;
        });
        if (!profile && options.profileFailureMode === "reject") {
          return redirectError("STEAM_PROFILE_UNAVAILABLE");
        }

        if (state.mode === "link") {
          const session = await getSessionFromCtx(ctx);
          if (!session || !state.userId || session.user.id !== state.userId) {
            return redirectError("STEAM_SESSION_REQUIRED");
          }
          const existing = await ctx.context.internalAdapter.findAccountByProviderId(
            steamId,
            STEAM_PROVIDER_ID,
          );
          if (existing && existing.userId !== session.user.id) {
            return redirectError("STEAM_ACCOUNT_ALREADY_LINKED");
          }
          if (!existing) {
            await ctx.context.internalAdapter.createAccount({
              accountId: steamId,
              providerId: STEAM_PROVIDER_ID,
              userId: session.user.id,
            });
          }
          await setSteamId(ctx, session.user.id, steamId);
          if (profile && ctx.context.options.account?.accountLinking?.updateUserInfoOnLink) {
            await ctx.context.internalAdapter.updateUser(session.user.id, {
              image: profile.avatarfull ?? session.user.image,
              name: profile.personaname ?? session.user.name,
            });
          }
          throw ctx.redirect(state.callbackURL);
        }

        const account = await ctx.context.internalAdapter.findAccountByProviderId(
          steamId,
          STEAM_PROVIDER_ID,
        );
        let user: User | null = null;
        let isNewUser = false;
        if (account) {
          user = await ctx.context.internalAdapter.findUserById(account.userId);
          if (!user) return redirectError("STEAM_ACCOUNT_NOT_FOUND");
          if (profile && options.updateUserInfoOnSignIn) {
            user = await ctx.context.internalAdapter.updateUser(user.id, {
              image: profile.avatarfull ?? user.image,
              name: profile.personaname ?? user.name,
            });
          }
          await setSteamId(ctx, user.id, steamId);
        } else {
          if (options.disableImplicitSignUp && !state.requestSignUp) {
            return redirectError("STEAM_SIGN_UP_DISABLED");
          }
          isNewUser = true;
          const mapped = profile ? await options.mapProfileToUser?.(profile) : undefined;
          user = await ctx.context.internalAdapter.createUser({
            ...mapped,
            email: mapped?.email ?? `steam_${steamId}@${syntheticEmailDomain}`,
            emailVerified: mapped?.emailVerified ?? false,
            image: mapped?.image ?? profile?.avatarfull ?? "",
            name: mapped?.name ?? profile?.personaname ?? `Steam User ${steamId}`,
          });
          if (!user) return redirectError("STEAM_ACCOUNT_NOT_FOUND");
          await ctx.context.internalAdapter.createAccount({
            accountId: steamId,
            providerId: STEAM_PROVIDER_ID,
            userId: user.id,
          });
          await setSteamId(ctx, user.id, steamId);
        }

        const session = await ctx.context.internalAdapter.createSession(user.id, false);
        await setSessionCookie(ctx, { session, user });
        throw ctx.redirect(isNewUser ? state.newUserCallbackURL : state.callbackURL);
      },
    ),
  };
}
