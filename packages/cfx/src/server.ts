import crypto from "node:crypto";

import type { BetterAuthPlugin, GenericEndpointContext, User } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  getSessionFromCtx,
  originCheckMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";

const PROVIDER_ID = "cfx";
const FLOW_PREFIX = "cfx-flow:";
const DEFAULT_FLOW_TTL_SECONDS = 10 * 60;

export interface CfxProfile {
  id: string;
  username: string;
  name: string;
  email: string;
  image: string | null;
}

export interface CfxPluginOptions {
  /** CFX Discourse instance. */
  forumUrl?: string;

  /** Name displayed by CFX when the user authorizes the application. */
  applicationName?: string;

  /** Default destination after a successful sign-in or link. */
  successCallbackURL?: string;

  /** Default destination when the callback fails. */
  errorCallbackURL?: string;

  /** Discourse User API Key scopes. */
  scopes?: string[];

  /** Lifetime of the temporary RSA/private-key flow state. */
  flowTTLSeconds?: number;

  /** Prevent CFX from creating brand-new Better Auth users. */
  disableSignUp?: boolean;

  /**
   * Permit an unlinked CFX account to attach to an existing Better Auth user
   * solely because both accounts use the same email address.
   *
   * Disabled by default. Explicit linking is safer.
   */
  allowImplicitLinking?: boolean;

  /** Update the Better Auth user's name/image when signing in through CFX. */
  updateUserInfoOnSignIn?: boolean;

  /** Revoke the remote Discourse User API Key during unlink. */
  revokeKeyOnUnlink?: boolean;

  /** Optional final user mapping before a Better Auth user is created. */
  mapProfileToUser?: (
    profile: CfxProfile,
  ) =>
    | Promise<Omit<Partial<User>, "id" | "createdAt" | "updatedAt">>
    | Omit<Partial<User>, "id" | "createdAt" | "updatedAt">;
}

type CfxFlowState = {
  mode: "sign-in" | "link";
  nonce: string;
  clientId: string;
  privateKey: string;
  callbackURL: string;
  errorCallbackURL: string;
  userId?: string;
};

type CfxAccountRecord = {
  id: string;
  userId: string;
  cfxId: string;
  username: string;
  apiKey: string;
  clientId: string;
  createdAt: Date;
  updatedAt: Date;
};

type BetterAuthUser = NonNullable<
  Awaited<ReturnType<GenericEndpointContext["context"]["internalAdapter"]["findUserById"]>>
>;

type VerificationValue = Awaited<
  ReturnType<GenericEndpointContext["context"]["internalAdapter"]["findVerificationValue"]>
>;

type InternalAdapterWithConsume = GenericEndpointContext["context"]["internalAdapter"] & {
  consumeVerificationValue?: (identifier: string) => Promise<VerificationValue>;
};

const initiateBodySchema = z.object({
  callbackURL: z.string().optional(),
  errorCallbackURL: z.string().optional(),
  link: z.boolean().optional().default(false),
});

const callbackQuerySchema = z.object({
  session: z.string().min(1),
  payload: z.string().min(1).optional(),
  error: z.string().optional(),
});

const cfxCallbackPayloadSchema = z.object({
  api: z.number().optional(),
  key: z.string().min(1),
  nonce: z.string().min(1),
  push: z.boolean().optional(),
});

type CfxCallbackPayload = z.infer<typeof cfxCallbackPayloadSchema>;

const cfxCurrentUserResponseSchema = z.object({
  current_user: z
    .object({
      avatar_template: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      id: z.union([z.number(), z.string()]),
      name: z.string().nullable().optional(),
      username: z.string(),
    })
    .optional(),
});

const cfxProfileResponseSchema = z.object({
  user: z
    .object({
      email: z.string().nullable().optional(),
    })
    .optional(),
});

const cfxFlowStateSchema = z.object({
  callbackURL: z.string(),
  clientId: z.string(),
  errorCallbackURL: z.string(),
  mode: z.enum(["sign-in", "link"]),
  nonce: z.string(),
  privateKey: z.string(),
  userId: z.string().optional(),
});

function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex");
}

function generateRSAKeyPair(): { publicKey: string; privateKey: string } {
  return crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
  });
}

function encryptionKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(`better-auth:cfx:${secret}`, "utf8").digest();
}

function encryptValue(value: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptValue(value: string, secret: string): string {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");

  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted CFX value");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function decryptCFXPayload(payload: string, privateKey: string): CfxCallbackPayload {
  // URLSearchParams may decode '+' in base64 as a space.
  const normalizedPayload = payload.replace(/ /g, "+").replace(/[\r\n]/g, "");

  const decrypted = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(normalizedPayload, "base64"),
  );

  return cfxCallbackPayloadSchema.parse(JSON.parse(decrypted.toString("utf8")));
}

function normalizeForumURL(value: string): string {
  const url = new URL(value);
  return url.toString().replace(/\/$/, "");
}

function normalizeAvatarURL(
  avatarTemplate: string | null | undefined,
  forumUrl: string,
): string | null {
  if (!avatarTemplate) return null;

  const avatarPath = avatarTemplate.replace("{size}", "256");
  return new URL(avatarPath, `${forumUrl}/`).toString();
}

type CfxLogger = {
  warn: (message: string, metadata?: Record<string, unknown>) => void;
  info?: (message: string, metadata?: Record<string, unknown>) => void;
};

function cfxAuthHeaders(apiKey: string, clientId: string): Record<string, string> {
  return {
    "User-Api-Key": apiKey,
    "User-Api-Client-Id": clientId,
    Accept: "application/json",
  };
}

async function fetchCFXProfile(
  apiKey: string,
  clientId: string,
  forumUrl: string,
  log?: CfxLogger,
): Promise<CfxProfile> {
  const headers = cfxAuthHeaders(apiKey, clientId);

  const response = await fetch(`${forumUrl}/session/current.json`, { headers });

  if (!response.ok) {
    log?.warn?.("CFX session/current.json lookup failed", {
      status: response.status,
    });
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: `CFX user lookup failed with HTTP ${response.status}`,
    });
  }

  const data = cfxCurrentUserResponseSchema.parse(await response.json());
  const currentUser = data.current_user ?? null;

  let email: string | null = typeof currentUser?.email === "string" ? currentUser.email : null;

  // The `session_info` scope may omit the user's email. Fall back to the user
  // profile endpoint (requires the `read` scope), which includes it for the
  // account holder.
  if (currentUser?.username && !email) {
    try {
      const profileResponse = await fetch(
        `${forumUrl}/users/${encodeURIComponent(currentUser.username)}.json`,
        { headers },
      );
      if (profileResponse.ok) {
        const profileData = cfxProfileResponseSchema.parse(await profileResponse.json());
        if (typeof profileData.user?.email === "string") {
          email = profileData.user.email;
        }
      }
    } catch (error) {
      log?.warn?.("CFX user profile email fallback failed", { error });
    }
  }

  const missing = [
    currentUser?.id ? null : "id",
    currentUser?.username ? null : "username",
    email ? null : "email",
  ].filter((field): field is string => field !== null);

  if (missing.length > 0) {
    log?.warn?.("CFX returned an incomplete user profile", {
      missing,
      hasCurrentUser: Boolean(currentUser),
      currentUser: currentUser
        ? {
            id: String(currentUser.id ?? ""),
            username: currentUser.username ?? null,
            hasEmail: Boolean(email),
            name: currentUser.name ?? null,
            hasAvatar: Boolean(currentUser.avatar_template),
          }
        : null,
    });
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "CFX did not return a complete user profile",
    });
  }

  if (!currentUser?.id || !currentUser.username || !email) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "CFX did not return a complete user profile",
    });
  }

  return {
    id: String(currentUser.id),
    username: currentUser.username,
    name: currentUser.name || currentUser.username,
    email: email.toLowerCase(),
    image: normalizeAvatarURL(currentUser.avatar_template, forumUrl),
  };
}

function assertTrustedRedirect(ctx: GenericEndpointContext, value: string): string {
  if (
    !ctx.context.isTrustedOrigin(value, {
      allowRelativePaths: true,
    })
  ) {
    throw new APIError("BAD_REQUEST", {
      message: "Untrusted CFX callback URL",
    });
  }

  return value;
}

function appendQuery(value: string, baseURL: string, values: Record<string, string>): string {
  const url = new URL(value, new URL(baseURL).origin);

  for (const [key, entry] of Object.entries(values)) {
    url.searchParams.set(key, entry);
  }

  return url.toString();
}

async function findCfxAccountByUserId(
  ctx: GenericEndpointContext,
  userId: string,
): Promise<CfxAccountRecord | null> {
  return ctx.context.adapter.findOne<CfxAccountRecord>({
    model: "cfxAccount",
    where: [{ field: "userId", value: userId }],
  });
}

async function findCfxAccountByCfxId(
  ctx: GenericEndpointContext,
  cfxId: string,
): Promise<CfxAccountRecord | null> {
  return ctx.context.adapter.findOne<CfxAccountRecord>({
    model: "cfxAccount",
    where: [{ field: "cfxId", value: cfxId }],
  });
}

async function ensureCfxLink(
  ctx: GenericEndpointContext,
  data: {
    userId: string;
    profile: CfxProfile;
    apiKey: string;
    clientId: string;
  },
): Promise<void> {
  const [providerAccount, cfxAccount, userCfxAccount] = await Promise.all([
    ctx.context.internalAdapter.findAccountByProviderId(data.profile.id, PROVIDER_ID),
    findCfxAccountByCfxId(ctx, data.profile.id),
    findCfxAccountByUserId(ctx, data.userId),
  ]);

  if (providerAccount && providerAccount.userId !== data.userId) {
    throw new APIError("BAD_REQUEST", {
      message: "This CFX account is already linked to another user",
    });
  }

  if (cfxAccount && cfxAccount.userId !== data.userId) {
    throw new APIError("BAD_REQUEST", {
      message: "This CFX account is already linked to another user",
    });
  }

  if (userCfxAccount && userCfxAccount.cfxId !== data.profile.id) {
    throw new APIError("BAD_REQUEST", {
      message: "This user already has a different CFX account linked",
    });
  }

  if (!providerAccount) {
    await ctx.context.internalAdapter.createAccount({
      accountId: data.profile.id,
      providerId: PROVIDER_ID,
      userId: data.userId,
    });
  }

  const encryptedApiKey = encryptValue(data.apiKey, ctx.context.secret);
  const now = new Date();
  const existing = cfxAccount || userCfxAccount;

  if (existing) {
    await ctx.context.adapter.update({
      model: "cfxAccount",
      update: {
        cfxId: data.profile.id,
        username: data.profile.username,
        apiKey: encryptedApiKey,
        clientId: data.clientId,
        updatedAt: now,
      },
      where: [{ field: "id", value: existing.id }],
    });
    return;
  }

  await ctx.context.adapter.create({
    model: "cfxAccount",
    data: {
      userId: data.userId,
      cfxId: data.profile.id,
      username: data.profile.username,
      apiKey: encryptedApiKey,
      clientId: data.clientId,
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function consumeVerificationValue(
  ctx: GenericEndpointContext,
  identifier: string,
): Promise<VerificationValue> {
  const adapter = ctx.context.internalAdapter as InternalAdapterWithConsume;

  // Better Auth 1.6.23 implements this method at runtime, but some published
  // declarations omit it from InternalAdapter. Prefer the atomic runtime API.
  if (typeof adapter.consumeVerificationValue === "function") {
    return adapter.consumeVerificationValue(identifier);
  }

  // Compatibility fallback for builds that genuinely predate the consume API.
  // Delete immediately after reading so a completed flow cannot be replayed.
  const verification = await adapter.findVerificationValue(identifier);
  if (!verification) return null;

  await adapter.deleteVerificationByIdentifier(identifier);
  return verification;
}

async function resolveSignInUser(
  ctx: GenericEndpointContext,
  options: CfxPluginOptions,
  profile: CfxProfile,
): Promise<BetterAuthUser> {
  const linkedAccount = await ctx.context.internalAdapter.findAccountByProviderId(
    profile.id,
    PROVIDER_ID,
  );

  if (linkedAccount) {
    const linkedUser = await ctx.context.internalAdapter.findUserById(linkedAccount.userId);

    if (!linkedUser) {
      throw new APIError("INTERNAL_SERVER_ERROR", {
        message: "The linked CFX user no longer exists",
      });
    }

    if (options.updateUserInfoOnSignIn) {
      return ctx.context.internalAdapter.updateUser(linkedUser.id, {
        name: profile.name,
        image: profile.image,
      });
    }

    return linkedUser;
  }

  const existingByEmail = await ctx.context.internalAdapter
    .findUserByEmail(profile.email)
    .then((result) => result?.user || null);

  if (existingByEmail) {
    if (!options.allowImplicitLinking) {
      throw new APIError("BAD_REQUEST", {
        message: "A user with this email already exists. Sign in first and explicitly link CFX.",
      });
    }

    await ctx.context.internalAdapter.createAccount({
      accountId: profile.id,
      providerId: PROVIDER_ID,
      userId: existingByEmail.id,
    });

    return existingByEmail;
  }

  if (options.disableSignUp) {
    throw new APIError("FORBIDDEN", {
      message: "CFX sign-up is disabled",
    });
  }

  const mappedUser = options.mapProfileToUser ? await options.mapProfileToUser(profile) : {};

  const created = await ctx.context.internalAdapter.createOAuthUser(
    {
      ...mappedUser,
      email: profile.email,
      emailVerified: true,
      name: profile.name,
      image: profile.image,
    },
    {
      providerId: PROVIDER_ID,
      accountId: profile.id,
    },
  );

  return created.user;
}

async function revokeRemoteKey(forumUrl: string, apiKey: string, clientId: string): Promise<void> {
  const response = await fetch(`${forumUrl}/user-api-key/revoke`, {
    method: "POST",
    headers: {
      "User-Api-Key": apiKey,
      "User-Api-Client-Id": clientId,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CFX key revocation failed with HTTP ${response.status}`);
  }
}

export const cfx = (options: CfxPluginOptions = {}) => {
  const forumUrl = normalizeForumURL(
    options.forumUrl || process.env.CFX_FORUM_URL || "https://forum.cfx.re",
  );
  const applicationName =
    options.applicationName || process.env.CFX_APP_NAME || "Better Auth CFX Integration";
  const flowTTLSeconds = options.flowTTLSeconds || DEFAULT_FLOW_TTL_SECONDS;
  const scopes = options.scopes?.length ? options.scopes : ["session_info"];

  return {
    id: PROVIDER_ID,

    schema: {
      cfxAccount: {
        fields: {
          userId: {
            type: "string",
            required: true,
            unique: true,
            references: {
              model: "user",
              field: "id",
              onDelete: "cascade",
            },
          },
          cfxId: {
            type: "string",
            required: true,
            unique: true,
          },
          username: {
            type: "string",
            required: true,
          },
          apiKey: {
            type: "string",
            required: true,
          },
          clientId: {
            type: "string",
            required: true,
          },
          createdAt: {
            type: "date",
            required: true,
          },
          updatedAt: {
            type: "date",
            required: true,
          },
        },
      },
    },

    endpoints: {
      cfxInitiate: createAuthEndpoint(
        "/cfx/initiate",
        {
          method: "POST",
          body: initiateBodySchema,
          requireHeaders: true,
          use: [originCheckMiddleware],
        },
        async (ctx) => {
          const currentSession = await getSessionFromCtx(ctx);

          if (ctx.body.link && !currentSession) {
            throw new APIError("UNAUTHORIZED", {
              message: "You must be signed in to link a CFX account",
            });
          }

          if (ctx.body.link && ctx.context.options.account?.accountLinking?.enabled === false) {
            throw new APIError("FORBIDDEN", {
              message: "Account linking is disabled",
            });
          }

          const callbackURL = assertTrustedRedirect(
            ctx,
            ctx.body.callbackURL || options.successCallbackURL || "/",
          );
          const errorCallbackURL = assertTrustedRedirect(
            ctx,
            ctx.body.errorCallbackURL || options.errorCallbackURL || "/login",
          );

          const { publicKey, privateKey } = generateRSAKeyPair();
          const nonce = randomHex(16);
          const clientId = randomHex(48);
          const sessionId = randomHex(32);
          const identifier = `${FLOW_PREFIX}${sessionId}`;

          const state: CfxFlowState = {
            mode: ctx.body.link ? "link" : "sign-in",
            nonce,
            clientId,
            privateKey,
            callbackURL,
            errorCallbackURL,
            userId: ctx.body.link ? currentSession?.user.id : undefined,
          };

          await ctx.context.internalAdapter.createVerificationValue({
            identifier,
            value: encryptValue(JSON.stringify(state), ctx.context.secret),
            expiresAt: new Date(Date.now() + flowTTLSeconds * 1000),
          });

          const authRedirect = `${ctx.context.baseURL.replace(/\/$/, "")}/cfx/callback?session=${encodeURIComponent(sessionId)}`;
          const params = new URLSearchParams({
            auth_redirect: authRedirect,
            application_name: applicationName,
            scopes: scopes.join(","),
            client_id: clientId,
            nonce,
            public_key: publicKey,
            padding: "oaep",
          });

          return ctx.json({
            url: `${forumUrl}/user-api-key/new?${params.toString()}`,
            redirect: true,
          });
        },
      ),

      cfxCallback: createAuthEndpoint(
        "/cfx/callback",
        {
          method: "GET",
          query: callbackQuerySchema,
          requireHeaders: true,
        },
        async (ctx) => {
          let state: CfxFlowState | null = null;

          try {
            const identifier = `${FLOW_PREFIX}${ctx.query.session}`;
            const verification = await consumeVerificationValue(ctx, identifier);

            if (!verification || verification.expiresAt < new Date()) {
              throw new APIError("BAD_REQUEST", {
                message: "CFX authentication session is missing or expired",
              });
            }

            state = cfxFlowStateSchema.parse(
              JSON.parse(decryptValue(verification.value, ctx.context.secret)),
            );

            if (ctx.query.error || !ctx.query.payload) {
              throw new APIError("BAD_REQUEST", {
                message: ctx.query.error || "CFX authorization was cancelled",
              });
            }

            const payload = decryptCFXPayload(ctx.query.payload, state.privateKey);

            const receivedNonce = Buffer.from(payload.nonce, "utf8");
            const expectedNonce = Buffer.from(state.nonce, "utf8");

            if (
              receivedNonce.length !== expectedNonce.length ||
              !crypto.timingSafeEqual(receivedNonce, expectedNonce)
            ) {
              throw new APIError("BAD_REQUEST", {
                message: "CFX callback nonce is invalid",
              });
            }

            const profile = await fetchCFXProfile(
              payload.key,
              state.clientId,
              forumUrl,
              ctx.context.logger,
            );

            if (state.mode === "link") {
              const activeSession = await getSessionFromCtx(ctx);

              if (!activeSession || !state.userId || activeSession.user.id !== state.userId) {
                throw new APIError("UNAUTHORIZED", {
                  message: "The session used to start CFX linking is no longer active",
                });
              }

              const allowDifferentEmails =
                ctx.context.options.account?.accountLinking?.allowDifferentEmails === true;

              if (
                !allowDifferentEmails &&
                activeSession.user.email.toLowerCase() !== profile.email.toLowerCase()
              ) {
                throw new APIError("FORBIDDEN", {
                  message: "The CFX account email does not match this user",
                });
              }

              await ensureCfxLink(ctx, {
                userId: activeSession.user.id,
                profile,
                apiKey: payload.key,
                clientId: state.clientId,
              });

              throw ctx.redirect(
                appendQuery(state.callbackURL, ctx.context.baseURL, {
                  cfx: "linked",
                }),
              );
            }

            const user = await resolveSignInUser(ctx, options, profile);

            await ensureCfxLink(ctx, {
              userId: user.id,
              profile,
              apiKey: payload.key,
              clientId: state.clientId,
            });

            const session = await ctx.context.internalAdapter.createSession(user.id);

            if (!session) {
              throw new APIError("INTERNAL_SERVER_ERROR", {
                message: "Failed to create Better Auth session",
              });
            }

            await setSessionCookie(ctx, {
              session,
              user,
            });

            throw ctx.redirect(
              appendQuery(state.callbackURL, ctx.context.baseURL, {
                cfx: "signed-in",
              }),
            );
          } catch (error) {
            // Redirect responses are intentionally thrown by Better Call.
            if (error instanceof Response) throw error;

            const message = error instanceof Error ? error.message : "CFX authentication failed";
            const fallback = state?.errorCallbackURL || options.errorCallbackURL || "/login";

            ctx.context.logger.error("CFX callback failed", error);

            throw ctx.redirect(
              appendQuery(fallback, ctx.context.baseURL, {
                error: "cfx_auth_failed",
                error_description: message,
              }),
            );
          }
        },
      ),

      cfxStatus: createAuthEndpoint(
        "/cfx/status",
        {
          method: "GET",
          requireHeaders: true,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const record = await findCfxAccountByUserId(ctx, ctx.context.session.user.id);

          return ctx.json({
            linked: Boolean(record),
            account: record
              ? {
                  cfxId: record.cfxId,
                  username: record.username,
                  updatedAt: record.updatedAt,
                }
              : null,
          });
        },
      ),

      cfxUnlink: createAuthEndpoint(
        "/cfx/unlink",
        {
          method: "POST",
          requireHeaders: true,
          use: [originCheckMiddleware, sessionMiddleware],
        },
        async (ctx) => {
          const userId = ctx.context.session.user.id;
          const record = await findCfxAccountByUserId(ctx, userId);

          if (!record) {
            return ctx.json({ success: true });
          }

          const accounts = await ctx.context.internalAdapter.findAccounts(userId);
          const cfxProviderAccount = accounts.find((account) => account.providerId === PROVIDER_ID);
          const allowUnlinkingAll =
            ctx.context.options.account?.accountLinking?.allowUnlinkingAll === true;

          if (cfxProviderAccount && accounts.length <= 1 && !allowUnlinkingAll) {
            throw new APIError("BAD_REQUEST", {
              message: "You cannot unlink the user's only sign-in method",
            });
          }

          if (options.revokeKeyOnUnlink !== false) {
            try {
              await revokeRemoteKey(
                forumUrl,
                decryptValue(record.apiKey, ctx.context.secret),
                record.clientId,
              );
            } catch (error) {
              // Local unlinking must still succeed if CFX is temporarily unavailable.
              ctx.context.logger.warn("Unable to revoke remote CFX key", error);
            }
          }

          await ctx.context.adapter.delete({
            model: "cfxAccount",
            where: [{ field: "id", value: record.id }],
          });

          if (cfxProviderAccount) {
            await ctx.context.internalAdapter.deleteAccount(cfxProviderAccount.id);
          }

          return ctx.json({ success: true });
        },
      ),
    },

    rateLimit: [
      {
        pathMatcher: (path) => path === "/cfx/initiate",
        max: 10,
        window: 60,
      },
      {
        pathMatcher: (path) => path === "/cfx/callback",
        max: 20,
        window: 60,
      },
    ],
  } satisfies BetterAuthPlugin;
};
