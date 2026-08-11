import type { BetterAuthPlugin, GenericEndpointContext, User } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
  originCheckMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { mergeSchema, type BetterAuthPluginDBSchema } from "better-auth/db";
import { z } from "zod";

import { STEAM_ERROR_CODES } from "./error-codes.js";
import {
  buildSteamOpenIDURL,
  fetchSteamProfile,
  verifySteamOpenIDResponse,
  type SteamProfile,
} from "./openid.js";
import { steamSchema } from "./schema.js";

const PROVIDER_ID = "steam";
const FLOW_PREFIX = "steam-flow:";
const DEFAULT_FLOW_TTL_SECONDS = 10 * 60;

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

type SteamFlowState = {
  callbackURL: string;
  errorCallbackURL: string;
  mode: "sign-in" | "link";
  newUserCallbackURL: string;
  requestSignUp: boolean;
  userId?: string;
};

type VerificationValue = Awaited<
  ReturnType<GenericEndpointContext["context"]["internalAdapter"]["findVerificationValue"]>
>;

type InternalAdapterWithConsume = GenericEndpointContext["context"]["internalAdapter"] & {
  consumeVerificationValue?: (identifier: string) => Promise<VerificationValue>;
};

const flowStateSchema = z.object({
  callbackURL: z.string(),
  errorCallbackURL: z.string(),
  mode: z.enum(["sign-in", "link"]),
  newUserCallbackURL: z.string(),
  requestSignUp: z.boolean(),
  userId: z.string().optional(),
});

const initiateBodySchema = z.object({
  callbackURL: z.string().optional(),
  disableRedirect: z.boolean().optional(),
  errorCallbackURL: z.string().optional(),
  newUserCallbackURL: z.string().optional(),
  requestSignUp: z.boolean().optional(),
});

const callbackQuerySchema = z.object({
  state: z.string().min(1),
  "openid.assoc_handle": z.string().optional(),
  "openid.claimed_id": z.string().optional(),
  "openid.identity": z.string().optional(),
  "openid.mode": z.string().optional(),
  "openid.ns": z.string().optional(),
  "openid.op_endpoint": z.string().optional(),
  "openid.response_nonce": z.string().optional(),
  "openid.return_to": z.string().optional(),
  "openid.sig": z.string().optional(),
  "openid.signed": z.string().optional(),
});

const linkBodySchema = z.object({
  callbackURL: z.string().optional(),
  disableRedirect: z.boolean().optional(),
  errorCallbackURL: z.string().optional(),
});

function randomState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function appendQuery(value: string, baseURL: string, entries: Record<string, string>): string {
  const url = new URL(value, baseURL);
  for (const [key, entry] of Object.entries(entries)) url.searchParams.set(key, entry);
  return url.toString();
}

function trustedRedirect(
  ctx: GenericEndpointContext,
  value: string | undefined,
  fallback: string,
): string {
  const resolved = new URL(value ?? fallback, ctx.context.baseURL).toString();
  if (!ctx.context.isTrustedOrigin(resolved, { allowRelativePaths: false })) {
    throw new APIError("BAD_REQUEST", { message: "Untrusted Steam callback URL" });
  }
  return resolved;
}

async function createFlow(
  ctx: GenericEndpointContext,
  state: SteamFlowState,
  ttlSeconds: number,
): Promise<string> {
  const stateId = randomState();
  await ctx.context.internalAdapter.createVerificationValue({
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    identifier: `${FLOW_PREFIX}${stateId}`,
    value: JSON.stringify(state),
  });
  return stateId;
}

async function consumeFlow(
  ctx: GenericEndpointContext,
  stateId: string,
): Promise<SteamFlowState | null> {
  const identifier = `${FLOW_PREFIX}${stateId}`;
  const adapter = ctx.context.internalAdapter as InternalAdapterWithConsume;
  let verification: VerificationValue;

  if (typeof adapter.consumeVerificationValue === "function") {
    verification = await adapter.consumeVerificationValue(identifier);
  } else {
    verification = await adapter.findVerificationValue(identifier);
    if (verification) await adapter.deleteVerificationByIdentifier(identifier);
  }

  if (!verification || verification.expiresAt < new Date()) return null;
  return flowStateSchema.parse(JSON.parse(verification.value));
}

async function setSteamId(
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

function openIDParams(query: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("openid.") && typeof value === "string") params.set(key, value);
  }
  return params;
}

export const steam = (options: SteamAuthPluginOptions) => {
  if (!options.steamApiKey.trim()) throw new Error("steamApiKey is required");
  const flowTTLSeconds = options.flowTTLSeconds ?? DEFAULT_FLOW_TTL_SECONDS;
  if (!Number.isInteger(flowTTLSeconds) || flowTTLSeconds <= 0) {
    throw new Error("flowTTLSeconds must be a positive integer");
  }
  const syntheticEmailDomain = options.syntheticEmailDomain?.trim() || "steam.local";

  return {
    id: PROVIDER_ID,
    schema: mergeSchema(steamSchema, options.schema),
    endpoints: {
      signInWithSteam: createAuthEndpoint(
        "/sign-in/steam",
        {
          body: initiateBodySchema,
          method: "POST",
          requireHeaders: true,
          use: [originCheckMiddleware],
          metadata: {
            openapi: { description: "Start Steam OpenID authentication" },
          },
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
          const url = buildSteamOpenIDURL(new URL(ctx.context.baseURL).origin, returnTo).toString();
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

          const steamId = await verifySteamOpenIDResponse(openIDParams(ctx.query)).catch(
            (error: unknown) => {
              ctx.context.logger.error("Steam OpenID verification failed", { error });
              return null;
            },
          );
          if (!steamId) return redirectError("STEAM_VERIFICATION_FAILED");

          const profile = await fetchSteamProfile(options.steamApiKey, steamId).catch(
            (error: unknown) => {
              ctx.context.logger.warn("Steam profile request failed", { error });
              return null;
            },
          );
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
              PROVIDER_ID,
            );
            if (existing && existing.userId !== session.user.id) {
              return redirectError("STEAM_ACCOUNT_ALREADY_LINKED");
            }
            if (!existing) {
              await ctx.context.internalAdapter.createAccount({
                accountId: steamId,
                providerId: PROVIDER_ID,
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
            PROVIDER_ID,
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
              providerId: PROVIDER_ID,
              userId: user.id,
            });
            await setSteamId(ctx, user.id, steamId);
          }

          const session = await ctx.context.internalAdapter.createSession(user.id, false);
          await setSessionCookie(ctx, { session, user });
          throw ctx.redirect(isNewUser ? state.newUserCallbackURL : state.callbackURL);
        },
      ),
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
          const account = accounts.find(({ providerId }) => providerId === PROVIDER_ID);
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
    },
    options,
    rateLimit: [
      { max: 10, pathMatcher: (path) => path === "/sign-in/steam", window: 60 },
      { max: 20, pathMatcher: (path) => path === "/steam/callback", window: 60 },
    ],
    $ERROR_CODES: STEAM_ERROR_CODES,
  } satisfies BetterAuthPlugin;
};
