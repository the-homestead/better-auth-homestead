import crypto from "node:crypto";

import type { BetterAuthPlugin, GenericEndpointContext } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  getIp,
  originCheckMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import { z } from "zod";

import {
  projectTebexEvent,
  type TebexPackageMapping,
  type TebexProjection,
} from "./entitlements.js";
import {
  createTebexClient,
  getBasketCheckoutURL,
  type TebexBasket,
  type TebexClientOptions,
  type TebexCreateBasketInput,
} from "./provider.js";
import { tebexSchema } from "./schema.js";
import { parseTebexWebhook, verifyTebexSignature, type TebexWebhook } from "./webhooks.js";

export const TEBEX_ERROR_CODES = {
  TEBEX_CHECKOUT_FAILED: {
    code: "TEBEX_CHECKOUT_FAILED",
    message: "Tebex checkout could not be created",
  },
  TEBEX_CUSTOMER_NOT_FOUND: {
    code: "TEBEX_CUSTOMER_NOT_FOUND",
    message: "Tebex customer was not found",
  },
  TEBEX_INVALID_SIGNATURE: {
    code: "TEBEX_INVALID_SIGNATURE",
    message: "Tebex webhook signature is invalid",
  },
  TEBEX_UNTRUSTED_REDIRECT: {
    code: "TEBEX_UNTRUSTED_REDIRECT",
    message: "Tebex redirect URL is not trusted",
  },
} as const;

export interface TebexPlayerIdentifier {
  field: TebexCreateBasketInput["userIdentifier"] extends infer Identifier
    ? Identifier extends { field: infer Field }
      ? Field
      : never
    : never;
  value: string;
}

export interface TebexCheckoutContext {
  packageId: number;
  quantity: number;
  user: { id: string; email: string; name: string };
}

export interface TebexEntitlementChange {
  customerId: string;
  event: TebexWebhook;
  projection: TebexProjection;
}

export interface TebexPluginOptions extends Pick<
  TebexClientOptions,
  "baseURL" | "fetch" | "privateKey" | "publicToken" | "timeoutMs"
> {
  webhookSecret: string;
  /** Allowed Tebex webhook source IPs. Set false only when upstream filtering is enforced. */
  webhookAllowedIPs?: readonly string[] | false;
  packageMappings: readonly TebexPackageMapping[];
  basketTTLSeconds?: number;
  resolvePlayer?: (
    context: TebexCheckoutContext,
  ) => Promise<TebexPlayerIdentifier | null> | TebexPlayerIdentifier | null;
  onEntitlementChanged?: (change: TebexEntitlementChange) => Promise<void> | void;
}

type CustomerRecord = {
  id: string;
  referenceId: string;
  customerType: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
};

type BasketRecord = {
  id: string;
  ident: string;
  checkoutReference: string;
  customerId: string;
  initiatedByUserId: string;
  beneficiaryUserId?: string;
  packageSnapshot: Array<{ packageId: number; quantity: number }>;
  status: string;
};

type PlayerIdentityRecord = {
  id: string;
  userId: string;
  usernameType: string;
  identifier: string;
  source: string;
  verifiedAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type EntityRecord = { id: string } & Record<string, unknown>;

const DEFAULT_TEBEX_WEBHOOK_IPS = ["18.209.80.3", "54.87.231.232"] as const;

const catalogQuerySchema = z.object({
  includePackages: z
    .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
    .optional(),
});
const packageQuerySchema = z.object({ packageId: z.coerce.number().int().positive() });
const checkoutBodySchema = z.object({
  callbackURL: z.string().min(1),
  cancelURL: z.string().min(1),
  disableRedirect: z.boolean().optional().default(false),
  packageId: z.number().int().positive(),
  quantity: z.number().int().positive().max(100).optional().default(1),
  variableData: z.record(z.string(), z.string()).optional(),
});
const callbackQuerySchema = z.object({ ident: z.string().min(1) });
const entitlementBodySchema = z.object({ key: z.string().min(1) });

function required(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new TypeError(`${name} is required`);
  return trimmed;
}

function validateOptions(options: TebexPluginOptions): void {
  required(options.publicToken, "publicToken");
  required(options.privateKey, "privateKey");
  required(options.webhookSecret, "webhookSecret");
  if (options.packageMappings.length === 0) {
    throw new TypeError("packageMappings must contain at least one package");
  }
  const packageIds = new Set<number>();
  for (const mapping of options.packageMappings) {
    if (!Number.isInteger(mapping.packageId) || mapping.packageId <= 0) {
      throw new TypeError("packageMappings packageId must be a positive integer");
    }
    if (packageIds.has(mapping.packageId)) {
      throw new TypeError(`packageMappings contains duplicate packageId ${mapping.packageId}`);
    }
    packageIds.add(mapping.packageId);
    if (mapping.entitlements.length === 0 || mapping.entitlements.some((key) => !key.trim())) {
      throw new TypeError(`packageMappings ${mapping.packageId} must define entitlements`);
    }
  }
}

function assertTrustedRedirect(ctx: GenericEndpointContext, value: string): string {
  if (!ctx.context.isTrustedOrigin(value, { allowRelativePaths: true })) {
    throw new APIError("BAD_REQUEST", {
      message: TEBEX_ERROR_CODES.TEBEX_UNTRUSTED_REDIRECT.message,
    });
  }
  return new URL(value, new URL(ctx.context.baseURL).origin).toString();
}

async function customerForUser(
  ctx: GenericEndpointContext,
  user: { id: string; email: string },
): Promise<CustomerRecord> {
  const existing = await ctx.context.adapter.findOne<CustomerRecord>({
    model: "tebexCustomer",
    where: [
      { field: "referenceId", value: user.id },
      { field: "customerType", value: "user" },
    ],
  });
  if (existing) return existing;
  const now = new Date();
  return ctx.context.adapter.create<CustomerRecord>({
    model: "tebexCustomer",
    data: {
      referenceId: user.id,
      customerType: "user",
      email: user.email,
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function customerForSession(ctx: GenericEndpointContext): Promise<CustomerRecord> {
  const session = ctx.context.session;
  if (!session) throw new APIError("UNAUTHORIZED");
  const customer = await ctx.context.adapter.findOne<CustomerRecord>({
    model: "tebexCustomer",
    where: [
      { field: "referenceId", value: session.user.id },
      { field: "customerType", value: "user" },
    ],
  });
  if (!customer) {
    throw new APIError("NOT_FOUND", {
      message: TEBEX_ERROR_CODES.TEBEX_CUSTOMER_NOT_FOUND.message,
    });
  }
  return customer;
}

async function persistPlayerIdentity(
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

function basketPlayerIdentity(basket: TebexBasket): TebexPlayerIdentifier | null {
  for (const field of ["user_id", "discord_id", "username"] as const) {
    const value = basket[field];
    if (typeof value === "string" && value.length > 0) return { field, value };
  }
  return null;
}

async function findBasketByReference(
  ctx: GenericEndpointContext,
  reference: string | undefined,
): Promise<BasketRecord | null> {
  if (!reference) return null;
  return ctx.context.adapter.findOne<BasketRecord>({
    model: "tebexBasket",
    where: [{ field: "checkoutReference", value: reference }],
  });
}

function checkoutReference(event: TebexWebhook): string | undefined {
  const custom = event.subject.custom;
  if (typeof custom !== "object" || custom === null) return undefined;
  const value = Object.entries(custom).find(([key]) => key === "checkoutReference")?.[1];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

async function upsertRecord(
  ctx: GenericEndpointContext,
  model: string,
  uniqueField: string,
  uniqueValue: string,
  data: Record<string, unknown>,
): Promise<EntityRecord> {
  const existing = await ctx.context.adapter.findOne<EntityRecord>({
    model,
    where: [{ field: uniqueField, value: uniqueValue }],
  });
  const now = new Date();
  if (existing) {
    return (
      (await ctx.context.adapter.update<EntityRecord>({
        model,
        update: { ...data, updatedAt: now },
        where: [{ field: "id", value: existing.id }],
      })) ?? existing
    );
  }
  return ctx.context.adapter.create<EntityRecord>({
    model,
    data: { ...data, createdAt: now, updatedAt: now },
  });
}

async function persistProjection(
  ctx: GenericEndpointContext,
  event: TebexWebhook,
  projection: TebexProjection,
): Promise<string | undefined> {
  const basket = await findBasketByReference(
    ctx,
    projection.payment?.checkoutReference ??
      projection.recurringPayment?.checkoutReference ??
      checkoutReference(event),
  );
  const customerId = basket?.customerId;
  if (projection.payment) {
    await upsertRecord(ctx, "tebexPayment", "transactionId", projection.payment.transactionId, {
      amount: projection.payment.amount,
      basketId: basket?.id,
      currency: projection.payment.currency,
      customerId,
      packages: projection.payment.packageIds,
      status: projection.payment.status,
      transactionId: projection.payment.transactionId,
      ...(projection.payment.status === "complete" ? { completedAt: event.date } : {}),
      ...(projection.payment.status === "refunded" ? { refundedAt: event.date } : {}),
    });
    if (basket && projection.payment.status === "complete") {
      await ctx.context.adapter.update({
        model: "tebexBasket",
        update: { completedAt: event.date, status: "complete", updatedAt: new Date() },
        where: [{ field: "id", value: basket.id }],
      });
    }
  }
  if (projection.recurringPayment) {
    await upsertRecord(
      ctx,
      "tebexRecurringPayment",
      "reference",
      projection.recurringPayment.reference,
      {
        customerId,
        initialTransactionId: projection.recurringPayment.initialTransactionId,
        packageId: projection.recurringPayment.packageId,
        reference: projection.recurringPayment.reference,
        status: projection.recurringPayment.status,
        ...(projection.recurringPayment.status === "ended" ? { endedAt: event.date } : {}),
      },
    );
  }
  if (!customerId) return undefined;
  await Promise.all(
    projection.entitlements.map(async (entitlement) => {
      const existing = await ctx.context.adapter.findOne<EntityRecord>({
        model: "tebexEntitlement",
        where: [
          { field: "customerId", value: customerId },
          { field: "key", value: entitlement.key },
          { field: "sourceReference", value: entitlement.sourceReference },
        ],
      });
      const now = new Date();
      const data = {
        beneficiaryUserId: basket?.beneficiaryUserId,
        customerId,
        key: entitlement.key,
        packageId: entitlement.packageId,
        quantity: 1,
        sourceReference: entitlement.sourceReference,
        sourceType: entitlement.sourceType,
        startsAt: event.date,
        status: entitlement.status,
        updatedAt: now,
      };
      if (existing) {
        await ctx.context.adapter.update({
          model: "tebexEntitlement",
          update: data,
          where: [{ field: "id", value: existing.id }],
        });
      } else {
        await ctx.context.adapter.create({
          model: "tebexEntitlement",
          data: { ...data, createdAt: now },
        });
      }
    }),
  );
  return customerId;
}

export const tebex = (options: TebexPluginOptions) => {
  validateOptions(options);
  const client = createTebexClient(options);
  const basketTTLSeconds = options.basketTTLSeconds ?? 30 * 60;
  const webhookAllowedIPs =
    options.webhookAllowedIPs === false
      ? false
      : (options.webhookAllowedIPs ?? DEFAULT_TEBEX_WEBHOOK_IPS);

  return {
    id: "tebex",
    schema: tebexSchema,
    endpoints: {
      getTebexStore: createAuthEndpoint("/tebex/store", { method: "GET" }, async (ctx) =>
        ctx.json(await client.getWebstore()),
      ),
      listTebexCategories: createAuthEndpoint(
        "/tebex/categories",
        { method: "GET", query: catalogQuerySchema },
        async (ctx) =>
          ctx.json(
            await client.listCategories(
              ctx.query?.includePackages === "true" || ctx.query?.includePackages === "1",
            ),
          ),
      ),
      listTebexPackages: createAuthEndpoint("/tebex/packages", { method: "GET" }, async (ctx) =>
        ctx.json(await client.listPackages()),
      ),
      getTebexPackage: createAuthEndpoint(
        "/tebex/package",
        { method: "GET", query: packageQuerySchema },
        async (ctx) => ctx.json(await client.getPackage(ctx.query.packageId)),
      ),
      createTebexCheckout: createAuthEndpoint(
        "/tebex/checkout",
        {
          body: checkoutBodySchema,
          method: "POST",
          requireHeaders: true,
          use: [originCheckMiddleware, sessionMiddleware],
        },
        async (ctx) => {
          if (!options.packageMappings.some(({ packageId }) => packageId === ctx.body.packageId)) {
            throw new APIError("BAD_REQUEST", { message: "Tebex package is not configured" });
          }
          const callbackURL = assertTrustedRedirect(ctx, ctx.body.callbackURL);
          const cancelURL = assertTrustedRedirect(ctx, ctx.body.cancelURL);
          const user = ctx.context.session.user;
          const customer = await customerForUser(ctx, user);
          const checkoutRef = crypto.randomUUID();
          const identifier = await options.resolvePlayer?.({
            packageId: ctx.body.packageId,
            quantity: ctx.body.quantity,
            user,
          });
          const playerIdentity = identifier
            ? await persistPlayerIdentity(ctx, user.id, identifier, "resolver")
            : null;
          const basket = await client.createBasket({
            cancelURL,
            completeURL: callbackURL,
            custom: { checkoutReference: checkoutRef, userId: user.id },
            ipAddress: ctx.context.session.session.ipAddress ?? undefined,
            userIdentifier: identifier ?? undefined,
          });
          const withPackage = await client.addPackage(basket.ident, {
            packageId: ctx.body.packageId,
            quantity: ctx.body.quantity,
            variableData: ctx.body.variableData,
          });
          const now = new Date();
          await ctx.context.adapter.create({
            model: "tebexBasket",
            data: {
              beneficiaryUserId: user.id,
              cancelURL,
              checkoutReference: checkoutRef,
              completeURL: callbackURL,
              createdAt: now,
              currency: withPackage.currency,
              customerId: customer.id,
              expiresAt: new Date(now.getTime() + basketTTLSeconds * 1000),
              ident: basket.ident,
              initiatedByUserId: user.id,
              packageSnapshot: [{ packageId: ctx.body.packageId, quantity: ctx.body.quantity }],
              playerIdentityId: playerIdentity?.id,
              status: "pending",
              updatedAt: now,
            },
          });
          let url = getBasketCheckoutURL(withPackage);
          if (!url) {
            const returnURL = `${ctx.context.baseURL}/tebex/callback?ident=${encodeURIComponent(basket.ident)}`;
            url = await client.getAuthURL(basket.ident, returnURL);
          }
          return ctx.json({
            checkoutReference: checkoutRef,
            redirect: !ctx.body.disableRedirect,
            url,
          });
        },
      ),
      tebexAuthCallback: createAuthEndpoint(
        "/tebex/callback",
        { method: "GET", query: callbackQuerySchema },
        async (ctx) => {
          const record = await ctx.context.adapter.findOne<BasketRecord>({
            model: "tebexBasket",
            where: [{ field: "ident", value: ctx.query.ident }],
          });
          if (!record) {
            throw new APIError("NOT_FOUND", {
              message: TEBEX_ERROR_CODES.TEBEX_CHECKOUT_FAILED.message,
            });
          }
          const basket = await client.getBasket(record.ident);
          const authenticatedIdentity = basketPlayerIdentity(basket);
          const playerIdentity = authenticatedIdentity
            ? await persistPlayerIdentity(
                ctx,
                record.initiatedByUserId,
                authenticatedIdentity,
                "tebex-auth",
              )
            : null;
          const url = getBasketCheckoutURL(basket);
          if (!url) {
            throw new APIError("BAD_GATEWAY", {
              message: TEBEX_ERROR_CODES.TEBEX_CHECKOUT_FAILED.message,
            });
          }
          await ctx.context.adapter.update({
            model: "tebexBasket",
            update: {
              ...(playerIdentity ? { playerIdentityId: playerIdentity.id } : {}),
              status: "ready",
              updatedAt: new Date(),
            },
            where: [{ field: "id", value: record.id }],
          });
          throw ctx.redirect(url);
        },
      ),
      receiveTebexWebhook: createAuthEndpoint(
        "/tebex/webhook",
        {
          disableBody: true,
          method: "POST",
          requireHeaders: true,
          requireRequest: true,
          metadata: { scope: "http" },
        },
        async (ctx) => {
          const webhookIP = getIp(ctx.request, ctx.context.options);
          if (webhookAllowedIPs && (!webhookIP || !webhookAllowedIPs.includes(webhookIP))) {
            throw new APIError("NOT_FOUND");
          }
          const rawBody = await ctx.request.text();
          const signature = ctx.headers.get("x-signature") ?? "";
          if (!verifyTebexSignature(rawBody, signature, options.webhookSecret)) {
            throw new APIError("UNAUTHORIZED", {
              message: TEBEX_ERROR_CODES.TEBEX_INVALID_SIGNATURE.message,
            });
          }
          const event = parseTebexWebhook(rawBody);
          const existingDelivery = await ctx.context.adapter.findOne<EntityRecord>({
            model: "tebexWebhookDelivery",
            where: [{ field: "deliveryId", value: event.id }],
          });
          const now = new Date();
          let delivery: EntityRecord;
          if (existingDelivery) {
            if (existingDelivery.status !== "failed") {
              return event.type === "validation.webhook"
                ? ctx.json({ id: event.id })
                : ctx.json({ duplicate: true, id: event.id, success: true });
            }
            delivery =
              (await ctx.context.adapter.update<EntityRecord>({
                model: "tebexWebhookDelivery",
                update: {
                  attempts:
                    (typeof existingDelivery.attempts === "number"
                      ? existingDelivery.attempts
                      : 1) + 1,
                  payload: rawBody,
                  status: "processing",
                  updatedAt: now,
                },
                where: [{ field: "id", value: existingDelivery.id }],
              })) ?? existingDelivery;
          } else {
            try {
              delivery = await ctx.context.adapter.create<EntityRecord>({
                model: "tebexWebhookDelivery",
                data: {
                  attempts: 1,
                  createdAt: now,
                  deliveryId: event.id,
                  eventType: event.type,
                  occurredAt: event.date,
                  payload: rawBody,
                  receivedAt: now,
                  status: "processing",
                  updatedAt: now,
                },
              });
            } catch (error) {
              const racedDelivery = await ctx.context.adapter.findOne<EntityRecord>({
                model: "tebexWebhookDelivery",
                where: [{ field: "deliveryId", value: event.id }],
              });
              if (racedDelivery) {
                return event.type === "validation.webhook"
                  ? ctx.json({ id: event.id })
                  : ctx.json({ duplicate: true, id: event.id, success: true });
              }
              throw error;
            }
          }
          try {
            const projection = projectTebexEvent(event, options.packageMappings);
            const customerId = await persistProjection(ctx, event, projection);
            if (customerId && projection.entitlements.length > 0) {
              await options.onEntitlementChanged?.({ customerId, event, projection });
            }
            await ctx.context.adapter.update({
              model: "tebexWebhookDelivery",
              update: { processedAt: new Date(), status: "processed", updatedAt: new Date() },
              where: [{ field: "id", value: delivery.id }],
            });
          } catch (error) {
            await ctx.context.adapter.update({
              model: "tebexWebhookDelivery",
              update: {
                lastError: error instanceof Error ? error.message : "Unknown webhook error",
                status: "failed",
                updatedAt: new Date(),
              },
              where: [{ field: "id", value: delivery.id }],
            });
            throw error;
          }
          return event.type === "validation.webhook"
            ? ctx.json({ id: event.id })
            : ctx.json({ id: event.id, success: true });
        },
      ),
      listTebexPayments: createAuthEndpoint(
        "/tebex/payments",
        { method: "GET", requireHeaders: true, use: [sessionMiddleware] },
        async (ctx) => {
          const customer = await customerForSession(ctx);
          return ctx.json(
            await ctx.context.adapter.findMany({
              model: "tebexPayment",
              sortBy: { direction: "desc", field: "createdAt" },
              where: [{ field: "customerId", value: customer.id }],
            }),
          );
        },
      ),
      listTebexRecurringPayments: createAuthEndpoint(
        "/tebex/recurring-payments",
        { method: "GET", requireHeaders: true, use: [sessionMiddleware] },
        async (ctx) => {
          const customer = await customerForSession(ctx);
          return ctx.json(
            await ctx.context.adapter.findMany({
              model: "tebexRecurringPayment",
              sortBy: { direction: "desc", field: "createdAt" },
              where: [{ field: "customerId", value: customer.id }],
            }),
          );
        },
      ),
      listTebexEntitlements: createAuthEndpoint(
        "/tebex/entitlements",
        { method: "GET", requireHeaders: true, use: [sessionMiddleware] },
        async (ctx) => {
          const customer = await customerForSession(ctx);
          return ctx.json(
            await ctx.context.adapter.findMany({
              model: "tebexEntitlement",
              sortBy: { direction: "desc", field: "createdAt" },
              where: [{ field: "customerId", value: customer.id }],
            }),
          );
        },
      ),
      checkTebexEntitlement: createAuthEndpoint(
        "/tebex/entitlements/check",
        {
          body: entitlementBodySchema,
          method: "POST",
          requireHeaders: true,
          use: [originCheckMiddleware, sessionMiddleware],
        },
        async (ctx) => {
          const customer = await customerForSession(ctx);
          const entitlement = await ctx.context.adapter.findOne<EntityRecord>({
            model: "tebexEntitlement",
            where: [
              { field: "customerId", value: customer.id },
              { field: "key", value: ctx.body.key },
              { field: "status", value: "active" },
            ],
          });
          return ctx.json({ active: Boolean(entitlement), entitlement });
        },
      ),
    },
    options,
    rateLimit: [
      { max: 10, pathMatcher: (path) => path === "/tebex/checkout", window: 60 },
      { max: 120, pathMatcher: (path) => path === "/tebex/webhook", window: 60 },
    ],
    $ERROR_CODES: TEBEX_ERROR_CODES,
  } satisfies BetterAuthPlugin;
};
