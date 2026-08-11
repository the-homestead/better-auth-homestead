import type { GenericEndpointContext } from "better-auth";

import type { TebexProjection } from "../../billing/projection.js";
import type { TebexWebhook } from "../../webhooks/signature.js";
import type { BasketRecord, EntityRecord } from "../records.js";

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

export async function persistProjection(
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
