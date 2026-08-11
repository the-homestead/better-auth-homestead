import crypto from "node:crypto";

import type { GenericEndpointContext } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  originCheckMiddleware,
  sessionMiddleware,
} from "better-auth/api";
import { z } from "zod";

import { getBasketCheckoutURL, type TebexClient } from "../../provider/client.js";
import { TEBEX_ERROR_CODES } from "../../shared/error-codes.js";
import type { TebexPluginOptions } from "../options.js";
import type { BasketRecord } from "../records.js";
import { customerForUser } from "../services/customers.js";
import { basketPlayerIdentity, persistPlayerIdentity } from "../services/identities.js";

const checkoutBodySchema = z.object({
  callbackURL: z.string().min(1),
  cancelURL: z.string().min(1),
  disableRedirect: z.boolean().optional().default(false),
  packageId: z.number().int().positive(),
  quantity: z.number().int().positive().max(100).optional().default(1),
  variableData: z.record(z.string(), z.string()).optional(),
});
const callbackQuerySchema = z.object({ ident: z.string().min(1) });

function assertTrustedRedirect(ctx: GenericEndpointContext, value: string): string {
  if (!ctx.context.isTrustedOrigin(value, { allowRelativePaths: true })) {
    throw new APIError("BAD_REQUEST", {
      message: TEBEX_ERROR_CODES.TEBEX_UNTRUSTED_REDIRECT.message,
    });
  }
  return new URL(value, new URL(ctx.context.baseURL).origin).toString();
}

export function createCheckoutEndpoints(
  options: TebexPluginOptions,
  client: TebexClient,
  basketTTLSeconds: number,
) {
  return {
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
        const checkoutReference = crypto.randomUUID();
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
          custom: { checkoutReference, userId: user.id },
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
            checkoutReference,
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
        return ctx.json({ checkoutReference, redirect: !ctx.body.disableRedirect, url });
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
  };
}
