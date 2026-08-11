import { APIError, createAuthEndpoint, getIp } from "better-auth/api";

import { projectTebexEvent } from "../../billing/projection.js";
import { TEBEX_ERROR_CODES } from "../../shared/error-codes.js";
import { parseTebexWebhook, verifyTebexSignature } from "../../webhooks/signature.js";
import type { TebexPluginOptions } from "../options.js";
import type { EntityRecord } from "../records.js";
import { persistProjection } from "../services/billing.js";

function webhookResponse(
  ctx: { json: (value: Record<string, unknown>) => unknown },
  event: { id: string; type: string },
  duplicate = false,
) {
  if (event.type === "validation.webhook") return ctx.json({ id: event.id });
  return ctx.json({ ...(duplicate ? { duplicate: true } : {}), id: event.id, success: true });
}

export function createWebhookEndpoint(
  options: TebexPluginOptions,
  allowedIPs: readonly string[] | false,
) {
  return createAuthEndpoint(
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
      if (allowedIPs && (!webhookIP || !allowedIPs.includes(webhookIP))) {
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
          return webhookResponse(ctx, event, true);
        }
        delivery =
          (await ctx.context.adapter.update<EntityRecord>({
            model: "tebexWebhookDelivery",
            update: {
              attempts:
                (typeof existingDelivery.attempts === "number" ? existingDelivery.attempts : 1) + 1,
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
          if (racedDelivery) return webhookResponse(ctx, event, true);
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
      return webhookResponse(ctx, event);
    },
  );
}
