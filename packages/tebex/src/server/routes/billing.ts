import { createAuthEndpoint, originCheckMiddleware, sessionMiddleware } from "better-auth/api";
import { z } from "zod";

import type { EntityRecord } from "../records.js";
import { customerForSession } from "../services/customers.js";

const entitlementBodySchema = z.object({ key: z.string().min(1) });

export function createBillingEndpoints() {
  return {
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
  };
}
