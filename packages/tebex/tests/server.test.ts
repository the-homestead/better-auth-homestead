import { describe, expect, spyOn, test } from "bun:test";
import { createPluginTestInstance } from "@homestead/ba-plugin-kit";

import { tebex } from "../src/server/index.ts";
import { createTebexSignature } from "../src/webhooks/signature.ts";

const options = {
  packageMappings: [{ entitlements: ["supporter"], packageId: 42 }],
  privateKey: "private-key",
  publicToken: "public-token",
  webhookAllowedIPs: false as const,
  webhookSecret: "webhook-secret",
};

async function checkoutFetch(input: RequestInfo | URL): Promise<Response> {
  const path = new URL(input instanceof Request ? input.url : input).pathname;
  return path.endsWith("/baskets")
    ? Response.json({ data: { ident: "basket-player", links: {} } })
    : Response.json({
        data: {
          ident: "basket-player",
          links: { checkout: "https://checkout.tebex.io/basket-player" },
        },
      });
}

describe("tebex server", () => {
  test("verifies a raw webhook and persists its delivery once", async () => {
    const instance = await createPluginTestInstance(tebex(options));
    const rawBody = JSON.stringify({
      date: "2026-08-11T12:00:00.000Z",
      id: "delivery-1",
      subject: {},
      type: "validation.webhook",
    });
    const request = () =>
      new Request("http://localhost:3000/api/auth/tebex/webhook", {
        body: rawBody,
        headers: {
          "content-type": "application/json",
          "x-signature": createTebexSignature(rawBody, options.webhookSecret),
        },
        method: "POST",
      });

    try {
      const first = await instance.auth.handler(request());
      const second = await instance.auth.handler(request());
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({ id: "delivery-1" });
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual({ id: "delivery-1" });

      const deliveries = await instance.context.adapter.findMany({
        model: "tebexWebhookDelivery",
        where: [{ field: "deliveryId", value: "delivery-1" }],
      });
      expect(deliveries).toHaveLength(1);
    } finally {
      instance.close();
    }
  });

  test("rejects a webhook whose signature does not match", async () => {
    const instance = await createPluginTestInstance(tebex(options));
    try {
      const response = await instance.auth.handler(
        new Request("http://localhost:3000/api/auth/tebex/webhook", {
          body: JSON.stringify({
            date: "2026-08-11T12:00:00.000Z",
            id: "delivery-invalid",
            subject: {},
            type: "validation.webhook",
          }),
          headers: { "content-type": "application/json", "x-signature": "invalid" },
          method: "POST",
        }),
      );
      expect(response.status).toBe(401);
    } finally {
      instance.close();
    }
  });

  test("rejects a signed webhook outside Tebex's IP allowlist", async () => {
    const instance = await createPluginTestInstance(
      tebex({ ...options, webhookAllowedIPs: undefined }),
    );
    const rawBody = JSON.stringify({
      date: "2026-08-11T12:00:00.000Z",
      id: "delivery-wrong-ip",
      subject: {},
      type: "validation.webhook",
    });
    try {
      const response = await instance.auth.handler(
        new Request("http://localhost:3000/api/auth/tebex/webhook", {
          body: rawBody,
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.10",
            "x-signature": createTebexSignature(rawBody, options.webhookSecret),
          },
          method: "POST",
        }),
      );
      expect(response.status).toBe(404);
    } finally {
      instance.close();
    }
  });

  test("projects completed and refunded payments into durable entitlements", async () => {
    const instance = await createPluginTestInstance(tebex(options));
    const now = new Date();
    try {
      const customer = await instance.context.adapter.create<{ id: string }>({
        model: "tebexCustomer",
        data: {
          createdAt: now,
          customerType: "user",
          email: "player@example.com",
          referenceId: "user-1",
          updatedAt: now,
        },
      });
      await instance.context.adapter.create({
        model: "tebexBasket",
        data: {
          beneficiaryUserId: "user-1",
          checkoutReference: "checkout-1",
          createdAt: now,
          customerId: customer.id,
          ident: "basket-1",
          initiatedByUserId: "user-1",
          packageSnapshot: [{ packageId: 42, quantity: 1 }],
          status: "pending",
          updatedAt: now,
        },
      });

      for (const [id, type] of [
        ["delivery-complete", "payment.completed"],
        ["delivery-refund", "payment.refunded"],
      ] as const) {
        const rawBody = JSON.stringify({
          date: "2026-08-11T12:00:00.000Z",
          id,
          subject: {
            custom: { checkoutReference: "checkout-1" },
            packages: [{ id: 42 }],
            transaction_id: "txn-1",
          },
          type,
        });
        // oxlint-disable-next-line eslint/no-await-in-loop -- Refund follows completion.
        const response = await instance.auth.handler(
          new Request("http://localhost:3000/api/auth/tebex/webhook", {
            body: rawBody,
            headers: {
              "content-type": "application/json",
              "x-signature": createTebexSignature(rawBody, options.webhookSecret),
            },
            method: "POST",
          }),
        );
        expect(response.status).toBe(200);
      }

      const payment = await instance.context.adapter.findOne<{ status: string }>({
        model: "tebexPayment",
        where: [{ field: "transactionId", value: "txn-1" }],
      });
      const entitlement = await instance.context.adapter.findOne<{ status: string }>({
        model: "tebexEntitlement",
        where: [{ field: "sourceReference", value: "txn-1" }],
      });
      expect(payment?.status).toBe("refunded");
      expect(entitlement?.status).toBe("revoked");
    } finally {
      instance.close();
    }
  });

  test("persists a resolved player identity with its checkout basket", async () => {
    const instance = await createPluginTestInstance(
      tebex({
        ...options,
        fetch: checkoutFetch,
        resolvePlayer: () => ({ field: "user_id", value: "fivem:123" }),
      }),
    );
    try {
      const user = await instance.test.saveUser(
        instance.test.createUser({ email: "player@example.com", name: "Player" }),
      );
      const headers = await instance.test.getAuthHeaders({ userId: user.id });
      headers.set("content-type", "application/json");
      headers.set("origin", "http://localhost:3000");
      const response = await instance.auth.handler(
        new Request("http://localhost:3000/api/auth/tebex/checkout", {
          body: JSON.stringify({
            callbackURL: "/billing/complete",
            cancelURL: "/billing/cancelled",
            packageId: 42,
          }),
          headers,
          method: "POST",
        }),
      );
      expect(response.status).toBe(200);

      const identity = await instance.context.adapter.findOne<{ id: string; identifier: string }>({
        model: "tebexPlayerIdentity",
        where: [{ field: "userId", value: user.id }],
      });
      const basket = await instance.context.adapter.findOne<{ playerIdentityId?: string }>({
        model: "tebexBasket",
        where: [{ field: "ident", value: "basket-player" }],
      });
      expect(identity?.identifier).toBe("fivem:123");
      expect(basket?.playerIdentityId).toBe(identity?.id);
    } finally {
      instance.close();
    }
  });

  test("reprocesses a failed webhook instead of acknowledging it as a duplicate", async () => {
    let hookAttempts = 0;
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined);
    const instance = await createPluginTestInstance(
      tebex({
        ...options,
        onEntitlementChanged: () => {
          hookAttempts += 1;
          if (hookAttempts === 1) throw new Error("temporary downstream failure");
        },
      }),
    );
    const now = new Date();
    try {
      const customer = await instance.context.adapter.create<{ id: string }>({
        model: "tebexCustomer",
        data: {
          createdAt: now,
          customerType: "user",
          referenceId: "retry-user",
          updatedAt: now,
        },
      });
      await instance.context.adapter.create({
        model: "tebexBasket",
        data: {
          checkoutReference: "retry-checkout",
          createdAt: now,
          customerId: customer.id,
          ident: "retry-basket",
          initiatedByUserId: "retry-user",
          packageSnapshot: [{ packageId: 42, quantity: 1 }],
          status: "pending",
          updatedAt: now,
        },
      });
      const rawBody = JSON.stringify({
        date: "2026-08-11T12:00:00.000Z",
        id: "delivery-retry",
        subject: {
          custom: { checkoutReference: "retry-checkout" },
          products: [{ id: 42 }],
          transaction_id: "txn-retry",
        },
        type: "payment.completed",
      });
      const request = () =>
        new Request("http://localhost:3000/api/auth/tebex/webhook", {
          body: rawBody,
          headers: {
            "content-type": "application/json",
            "x-signature": createTebexSignature(rawBody, options.webhookSecret),
          },
          method: "POST",
        });

      expect((await instance.auth.handler(request())).status).toBe(500);
      const retried = await instance.auth.handler(request());
      expect(retried.status).toBe(200);
      expect(await retried.json()).toEqual({ id: "delivery-retry", success: true });
      const delivery = await instance.context.adapter.findOne<{
        attempts: number;
        status: string;
      }>({
        model: "tebexWebhookDelivery",
        where: [{ field: "deliveryId", value: "delivery-retry" }],
      });
      expect(delivery).toMatchObject({ attempts: 2, status: "processed" });
    } finally {
      instance.close();
      consoleError.mockRestore();
    }
  });
});
