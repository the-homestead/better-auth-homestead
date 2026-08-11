import type { BetterAuthPlugin, User } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
  sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import { isOriginTrusted } from "./origin-match.js";

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
const STEAM_PROFILE_URL = "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/";

const steamProfileSchema = z.object({
  avatar: z.string().optional(),
  avatarfull: z.string().optional(),
  personaname: z.string().optional(),
  profileurl: z.string().optional(),
  realname: z.string().optional(),
  steamid: z.string(),
});

const steamProfileResponseSchema = z.object({
  response: z
    .object({
      players: z.array(steamProfileSchema).optional(),
    })
    .optional(),
});

export type SteamProfile = z.infer<typeof steamProfileSchema>;

export type SteamAuthPluginOptions = {
  accountLinking?: boolean;
  disableImplicitSignUp?: boolean;
  mapProfileToUser?: (
    profile: SteamProfile & { email: string },
  ) => Promise<Omit<Partial<User>, "id" | "createdAt" | "updatedAt">>;
  steamApiKey: string;
};

async function readSteamValidationResult(params: URLSearchParams): Promise<string> {
  const validationParams = new URLSearchParams(params);
  validationParams.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: validationParams,
  });

  if (!response.ok) {
    throw new Error(`Steam validation failed with status ${response.status}`);
  }

  return response.text();
}

async function fetchSteamProfile(
  steamApiKey: string,
  steamId: string,
): Promise<SteamProfile | null> {
  const profileUrl = new URL(STEAM_PROFILE_URL);
  profileUrl.searchParams.set("key", steamApiKey);
  profileUrl.searchParams.set("steamids", steamId);

  const response = await fetch(profileUrl, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Steam profile request failed with status ${response.status}`);
  }

  const payload = steamProfileResponseSchema.parse(await response.json());

  return payload.response?.players?.[0] ?? null;
}

async function resolveTrustedOrigins(
  trustedOrigins:
    | (string | null | undefined)[]
    | ((
        request?: Request,
      ) => Promise<(string | null | undefined)[]> | (string | null | undefined)[])
    | undefined,
  request: Request | undefined,
): Promise<string[]> {
  if (!trustedOrigins) {
    return [];
  }

  const resolved =
    typeof trustedOrigins === "function" ? await trustedOrigins(request) : trustedOrigins;

  return resolved.filter((origin): origin is string => typeof origin === "string");
}

function resolveAbsoluteUrl(value: string, baseUrl: string): string {
  return new URL(value, baseUrl).toString();
}

function ensureTrustedCallbackUrl(
  callbackURL: string,
  trustedOrigins: readonly string[],
  errorURL: string,
  logger: { error: (message: string, metadata?: Record<string, unknown>) => void },
  label: string,
) {
  const callbackOrigin = new URL(callbackURL).origin;

  if (!isOriginTrusted(callbackOrigin, trustedOrigins)) {
    logger.error(`${label} URL not in trusted origins`, {
      callbackOrigin,
      callbackURL,
      trustedOrigins,
    });

    const errorCode = label.toLowerCase().replace(/\s+/g, "_");
    throw new APIError("BAD_REQUEST", {
      message: `${label} URL is not trusted`,
      redirectTo: `${errorURL}?error=${errorCode}_not_trusted`,
    });
  }
}

export const steam = (options: SteamAuthPluginOptions) =>
  ({
    id: "steam",
    endpoints: {
      signInWithSteam: createAuthEndpoint(
        "/sign-in/steam",
        {
          method: "POST",
          body: z.object({
            email: z.string().email(),
            callbackURL: z.string().optional(),
            errorCallbackURL: z.string().optional(),
            newUserCallbackURL: z.string().optional(),
            disableRedirect: z.boolean().optional(),
            oauth_query: z.string().optional(),
            requestSignUp: z.boolean().optional(),
          }),
        },
        async (ctx) => {
          const callbackURL = resolveAbsoluteUrl(ctx.body.callbackURL ?? "/", ctx.context.baseURL);
          const errorCallbackURL = ctx.body.errorCallbackURL
            ? resolveAbsoluteUrl(ctx.body.errorCallbackURL, ctx.context.baseURL)
            : undefined;
          const newUserCallbackURL = ctx.body.newUserCallbackURL
            ? resolveAbsoluteUrl(ctx.body.newUserCallbackURL, ctx.context.baseURL)
            : undefined;

          const queryParams = new URLSearchParams({
            callbackURL,
            email: ctx.body.email,
            requestSignUp: String(Boolean(ctx.body.requestSignUp)),
          });

          if (errorCallbackURL) {
            queryParams.set("errorCallbackURL", errorCallbackURL);
          }

          if (newUserCallbackURL) {
            queryParams.set("newUserCallbackURL", newUserCallbackURL);
          }

          const steamUrl = new URL(STEAM_OPENID_URL);
          steamUrl.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
          steamUrl.searchParams.set("openid.mode", "checkid_setup");
          steamUrl.searchParams.set("openid.realm", new URL(ctx.context.baseURL).origin);
          steamUrl.searchParams.set(
            "openid.identity",
            "http://specs.openid.net/auth/2.0/identifier_select",
          );
          steamUrl.searchParams.set(
            "openid.claimed_id",
            "http://specs.openid.net/auth/2.0/identifier_select",
          );
          steamUrl.searchParams.set(
            "openid.return_to",
            `${ctx.context.baseURL}/steam/callback?${queryParams.toString()}`,
          );

          return ctx.json({
            redirect: !ctx.body.disableRedirect,
            url: steamUrl.toString(),
          });
        },
      ),
      steamCallback: createAuthEndpoint(
        "/steam/callback",
        {
          method: "GET",
          query: z.object({
            callbackURL: z.string().optional(),
            email: z.string().optional(),
            errorCallbackURL: z.string().optional(),
            linkAccount: z.string().optional(),
            newUserCallbackURL: z.string().optional(),
            requestSignUp: z.enum(["true", "false"]).optional().default("false"),
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
          }),
          metadata: {
            client: false,
          },
        },
        async (ctx) => {
          const baseErrorURL =
            ctx.context.options.onAPIError?.errorURL ?? `${ctx.context.baseURL}/error`;
          const trustedOrigins = await resolveTrustedOrigins(
            ctx.context.options.trustedOrigins,
            ctx.request,
          );

          const callbackURL = resolveAbsoluteUrl(ctx.query.callbackURL ?? "/", ctx.context.baseURL);
          const errorCallbackURL = resolveAbsoluteUrl(
            ctx.query.errorCallbackURL ?? baseErrorURL,
            ctx.context.baseURL,
          );
          const newUserCallbackURL = resolveAbsoluteUrl(
            ctx.query.newUserCallbackURL ?? callbackURL,
            ctx.context.baseURL,
          );

          ensureTrustedCallbackUrl(
            errorCallbackURL,
            trustedOrigins,
            `${ctx.context.baseURL}/error`,
            ctx.context.logger,
            "Error callback",
          );
          ensureTrustedCallbackUrl(
            callbackURL,
            trustedOrigins,
            errorCallbackURL,
            ctx.context.logger,
            "Callback",
          );
          ensureTrustedCallbackUrl(
            newUserCallbackURL,
            trustedOrigins,
            errorCallbackURL,
            ctx.context.logger,
            "New user callback",
          );
          const validationResult = await readSteamValidationResult(
            new URLSearchParams(
              Object.entries(ctx.query).flatMap(([key, value]) =>
                typeof value === "string" ? ([[key, value]] satisfies [string, string][]) : [],
              ),
            ),
          ).catch((error: unknown) => {
            ctx.context.logger.error("Steam OpenID validation request failed", {
              error,
            });
            return null;
          });

          if (!validationResult?.includes("is_valid:true")) {
            throw ctx.redirect(`${errorCallbackURL}?error=steam_openid_validation_failed`);
          }

          const steamId = ctx.query["openid.claimed_id"]?.split("/").pop();
          if (!steamId) {
            throw ctx.redirect(`${errorCallbackURL}?error=steamid_missing`);
          }

          const profile = await fetchSteamProfile(options.steamApiKey, steamId).catch(
            (error: unknown) => {
              ctx.context.logger.error(
                "Steam profile fetch failed",
                error instanceof Error ? { message: error.message } : { error },
              );
              return null;
            },
          );

          if (!profile) {
            throw ctx.redirect(`${errorCallbackURL}?error=steam_profile_not_found`);
          }

          if (ctx.query.linkAccount === "true") {
            const session = await getSessionFromCtx(ctx);
            if (!session) {
              throw ctx.redirect(`${errorCallbackURL}?error=session_required_for_linking`);
            }

            const existingAccount = await ctx.context.internalAdapter.findAccountByProviderId(
              steamId,
              "steam",
            );
            if (existingAccount) {
              if (existingAccount.userId !== session.user.id) {
                throw ctx.redirect(`${errorCallbackURL}?error=account_already_linked`);
              }

              throw ctx.redirect(callbackURL);
            }

            const linkedAccount = await ctx.context.internalAdapter.createAccount({
              accountId: steamId,
              providerId: "steam",
              userId: session.user.id,
            });

            if (!linkedAccount) {
              throw ctx.redirect(`${errorCallbackURL}?error=account_creation_failed`);
            }

            if (ctx.context.options.account?.accountLinking?.updateUserInfoOnLink === true) {
              await ctx.context.internalAdapter.updateUser(session.user.id, {
                image: profile.avatarfull ?? session.user.image,
                name: profile.personaname ?? session.user.name,
              });
            }

            throw ctx.redirect(callbackURL);
          }

          const email = ctx.query.email;
          if (!email || !z.email().safeParse(email).success) {
            throw ctx.redirect(`${errorCallbackURL}?error=invalid_email`);
          }

          let account = await ctx.context.internalAdapter.findAccountByProviderId(steamId, "steam");
          let user: User | null = null;
          let isNewUser = false;

          const shouldCreateUser =
            !account &&
            (options.disableImplicitSignUp === true ? ctx.query.requestSignUp === "true" : true);

          if (shouldCreateUser) {
            isNewUser = true;

            const mappedUser = await options.mapProfileToUser?.({
              ...profile,
              email,
            });

            user = await ctx.context.internalAdapter.createUser({
              ...mappedUser,
              email: mappedUser?.email ?? email,
              emailVerified: mappedUser?.emailVerified,
              image: mappedUser?.image ?? profile.avatarfull ?? "",
              name: mappedUser?.name ?? profile.personaname ?? "Steam User",
            });

            if (!user) {
              throw ctx.redirect(`${errorCallbackURL}?error=user_creation_failed`);
            }

            account = await ctx.context.internalAdapter.createAccount({
              accountId: steamId,
              providerId: "steam",
              userId: user.id,
            });

            if (!account) {
              throw ctx.redirect(`${errorCallbackURL}?error=account_creation_failed`);
            }
          } else if (account) {
            user = await ctx.context.internalAdapter.findUserById(account.userId);

            if (!user) {
              throw ctx.redirect(`${errorCallbackURL}?error=user_not_found`);
            }
          } else {
            throw ctx.redirect(`${errorCallbackURL}?error=account_not_found`);
          }

          const session = await ctx.context.internalAdapter.createSession(user.id, false);

          await setSessionCookie(ctx, {
            session,
            user,
          });

          throw ctx.redirect(isNewUser ? newUserCallbackURL : callbackURL);
        },
      ),
      linkAccountWithSteam: createAuthEndpoint(
        "/link-social/steam",
        {
          method: "POST",
          use: [sessionMiddleware],
          body: z.object({
            callbackURL: z.string().optional(),
            disableRedirect: z.boolean().optional(),
            email: z.string().email(),
            errorCallbackURL: z.string().optional(),
          }),
        },
        async (ctx) => {
          if (options.accountLinking !== true) {
            throw new APIError("BAD_REQUEST", {
              message: "Account linking is disabled",
            });
          }

          const callbackURL = resolveAbsoluteUrl(ctx.body.callbackURL ?? "/", ctx.context.baseURL);
          const errorCallbackURL = resolveAbsoluteUrl(
            ctx.body.errorCallbackURL ?? `${ctx.context.baseURL}/error`,
            ctx.context.baseURL,
          );

          const queryParams = new URLSearchParams({
            callbackURL,
            email: ctx.body.email,
            errorCallbackURL,
            linkAccount: "true",
          });

          const steamUrl = new URL(STEAM_OPENID_URL);
          steamUrl.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
          steamUrl.searchParams.set("openid.mode", "checkid_setup");
          steamUrl.searchParams.set("openid.realm", new URL(ctx.context.baseURL).origin);
          steamUrl.searchParams.set(
            "openid.identity",
            "http://specs.openid.net/auth/2.0/identifier_select",
          );
          steamUrl.searchParams.set(
            "openid.claimed_id",
            "http://specs.openid.net/auth/2.0/identifier_select",
          );
          steamUrl.searchParams.set(
            "openid.return_to",
            `${ctx.context.baseURL}/steam/callback?${queryParams.toString()}`,
          );

          return ctx.json({
            redirect: !ctx.body.disableRedirect,
            url: steamUrl.toString(),
          });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
