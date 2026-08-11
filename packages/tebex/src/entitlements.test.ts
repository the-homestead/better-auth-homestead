import { describe, expect, test } from "bun:test";

import { projectTebexEvent } from "./entitlements.ts";
import type { TebexWebhook } from "./webhooks.ts";

const mappings = [{ entitlements: ["supporter", "queue.priority"], packageId: 42 }] as const;

function webhook(type: string, subject: Record<string, unknown>): TebexWebhook {
  return { date: new Date("2026-08-11T12:00:00Z"), id: "delivery", subject, type };
}

describe("projectTebexEvent", () => {
  test("activates mapped entitlements for completed payments", () => {
    const projection = projectTebexEvent(
      webhook("payment.completed", {
        custom: { checkoutReference: "checkout-1" },
        products: [{ id: 42 }],
        transaction_id: "tbx-1",
      }),
      mappings,
    );

    expect(projection.payment).toMatchObject({
      checkoutReference: "checkout-1",
      status: "complete",
      transactionId: "tbx-1",
    });
    expect(projection.entitlements).toEqual([
      {
        key: "supporter",
        packageId: 42,
        sourceReference: "tbx-1",
        sourceType: "payment",
        status: "active",
      },
      {
        key: "queue.priority",
        packageId: 42,
        sourceReference: "tbx-1",
        sourceType: "payment",
        status: "active",
      },
    ]);
  });

  test.each([
    ["payment.refunded", "revoked"],
    ["payment.dispute.opened", "suspended"],
    ["payment.dispute.won", "active"],
    ["payment.dispute.lost", "revoked"],
  ] as const)("maps %s to %s", (type, status) => {
    const projection = projectTebexEvent(
      webhook(type, { packages: [{ id: 42 }], transaction_id: "tbx-1" }),
      mappings,
    );
    expect(projection.entitlements.every((entry) => entry.status === status)).toBe(true);
  });

  test("maps recurring lifecycle events", () => {
    const started = projectTebexEvent(
      webhook("recurring-payment.started", {
        package: { id: 42 },
        reference: "recurring-1",
      }),
      mappings,
    );
    const ended = projectTebexEvent(
      webhook("recurring-payment.ended", {
        package_id: 42,
        recurring_payment_reference: "recurring-1",
      }),
      mappings,
    );

    expect(started.recurringPayment?.status).toBe("active");
    expect(started.entitlements[0]?.sourceType).toBe("recurring-payment");
    expect(ended.recurringPayment?.status).toBe("ended");
    expect(ended.entitlements[0]?.status).toBe("expired");
  });

  test("correlates official recurring payloads through the initial payment", () => {
    const projection = projectTebexEvent(
      webhook("recurring-payment.started", {
        initial_payment: {
          custom: { checkoutReference: "checkout-recurring" },
          products: [{ id: 42 }],
          transaction_id: "tbx-initial",
        },
        reference: "tbx-r-1",
      }),
      mappings,
    );

    expect(projection.recurringPayment).toEqual({
      checkoutReference: "checkout-recurring",
      initialTransactionId: "tbx-initial",
      packageId: 42,
      reference: "tbx-r-1",
      status: "active",
    });
    expect(projection.entitlements).toHaveLength(2);
  });

  test("ignores packages without configured entitlement mappings", () => {
    const projection = projectTebexEvent(
      webhook("payment.completed", { package_id: 99, transaction_id: "tbx-2" }),
      mappings,
    );
    expect(projection.entitlements).toEqual([]);
  });
});
