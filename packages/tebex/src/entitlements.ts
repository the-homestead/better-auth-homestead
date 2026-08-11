import type { TebexWebhook } from "./webhooks.js";

export interface TebexPackageMapping {
  packageId: number;
  entitlements: readonly string[];
}

export interface EntitlementTransition {
  key: string;
  packageId: number;
  sourceReference: string;
  sourceType: "payment" | "recurring-payment";
  status: "active" | "suspended" | "revoked" | "expired";
}

export interface TebexProjection {
  payment?: {
    transactionId: string;
    checkoutReference?: string;
    status: string;
    packageIds: number[];
    amount?: number;
    currency?: string;
  };
  recurringPayment?: {
    reference: string;
    status: string;
    packageId: number;
    checkoutReference?: string;
    initialTransactionId?: string;
  };
  entitlements: EntitlementTransition[];
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function packageIds(subject: Record<string, unknown>): number[] {
  const direct = number(subject.package_id) ?? number(record(subject.package)?.id);
  const collections = [subject.products, subject.packages];
  const values = collections.flatMap((collection) =>
    Array.isArray(collection)
      ? collection.map(
          (entry) => number(record(entry)?.id) ?? number(record(record(entry)?.package)?.id),
        )
      : [],
  );
  return [...new Set([direct, ...values].filter((value): value is number => value !== undefined))];
}

function transitions(
  ids: readonly number[],
  sourceReference: string,
  sourceType: EntitlementTransition["sourceType"],
  status: EntitlementTransition["status"],
  mappings: readonly TebexPackageMapping[],
): EntitlementTransition[] {
  return ids.flatMap((packageId) => {
    const mapping = mappings.find((entry) => entry.packageId === packageId);
    return (mapping?.entitlements ?? []).map((key) => ({
      key,
      packageId,
      sourceReference,
      sourceType,
      status,
    }));
  });
}

const paymentStatuses: Record<
  string,
  { payment: string; entitlement?: EntitlementTransition["status"] }
> = {
  "payment.completed": { payment: "complete", entitlement: "active" },
  "payment.declined": { payment: "declined" },
  "payment.refunded": { payment: "refunded", entitlement: "revoked" },
  "payment.dispute.opened": { payment: "disputed", entitlement: "suspended" },
  "payment.dispute.won": { payment: "complete", entitlement: "active" },
  "payment.dispute.lost": { payment: "chargeback", entitlement: "revoked" },
  "payment.dispute.closed": { payment: "disputed", entitlement: "suspended" },
};

const recurringStatuses: Record<
  string,
  { recurring: string; entitlement?: EntitlementTransition["status"] }
> = {
  "recurring-payment.started": { recurring: "active", entitlement: "active" },
  "recurring-payment.renewed": { recurring: "active", entitlement: "active" },
  "recurring-payment.cancellation.requested": { recurring: "cancel-pending" },
  "recurring-payment.cancellation.aborted": { recurring: "active", entitlement: "active" },
  "recurring-payment.ended": { recurring: "ended", entitlement: "expired" },
};

export function projectTebexEvent(
  webhook: TebexWebhook,
  mappings: readonly TebexPackageMapping[],
): TebexProjection {
  const ids = packageIds(webhook.subject);
  const paymentRule = paymentStatuses[webhook.type];
  if (paymentRule) {
    const transactionId = string(webhook.subject.transaction_id);
    if (!transactionId) return { entitlements: [] };
    const custom = record(webhook.subject.custom);
    const checkoutReference = string(custom?.checkoutReference);
    const amountValue = webhook.subject.amount ?? record(webhook.subject.price_paid)?.amount;
    const amount = typeof amountValue === "number" ? amountValue : undefined;
    const currency = string(
      webhook.subject.currency ?? record(webhook.subject.price_paid)?.currency,
    );
    return {
      payment: {
        transactionId,
        status: paymentRule.payment,
        packageIds: ids,
        ...(checkoutReference ? { checkoutReference } : {}),
        ...(amount !== undefined ? { amount } : {}),
        ...(currency ? { currency } : {}),
      },
      entitlements: paymentRule.entitlement
        ? transitions(ids, transactionId, "payment", paymentRule.entitlement, mappings)
        : [],
    };
  }

  const recurringRule = recurringStatuses[webhook.type];
  if (recurringRule) {
    const initialPayment = record(webhook.subject.initial_payment);
    const recurringIds = ids.length > 0 ? ids : initialPayment ? packageIds(initialPayment) : [];
    const reference =
      string(webhook.subject.recurring_payment_reference) ?? string(webhook.subject.reference);
    const packageId = recurringIds[0];
    if (!reference || packageId === undefined) return { entitlements: [] };
    const initialTransactionId = string(initialPayment?.transaction_id);
    const initialCustom = record(initialPayment?.custom);
    const checkoutReference = string(initialCustom?.checkoutReference);
    return {
      recurringPayment: {
        reference,
        status: recurringRule.recurring,
        packageId,
        ...(checkoutReference ? { checkoutReference } : {}),
        ...(initialTransactionId ? { initialTransactionId } : {}),
      },
      entitlements: recurringRule.entitlement
        ? transitions(
            [packageId],
            reference,
            "recurring-payment",
            recurringRule.entitlement,
            mappings,
          )
        : [],
    };
  }

  return { entitlements: [] };
}
