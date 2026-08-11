import crypto from "node:crypto";

import { describe, expect, test } from "bun:test";

import { createTebexSignature, parseTebexWebhook, verifyTebexSignature } from "./webhooks.ts";

const rawBody = JSON.stringify({
  date: "2026-08-11T12:00:00Z",
  id: "delivery-1",
  subject: { transaction_id: "tbx-1" },
  type: "payment.completed",
});

describe("Tebex webhook security", () => {
  test("implements Tebex's SHA256 body hash then HMAC signature", () => {
    const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    const expected = crypto.createHmac("sha256", "secret").update(bodyHash).digest("hex");

    expect(createTebexSignature(rawBody, "secret")).toBe(expected);
    expect(verifyTebexSignature(rawBody, expected, "secret")).toBe(true);
  });

  test("rejects tampered bodies and malformed signatures", () => {
    const signature = createTebexSignature(rawBody, "secret");
    expect(verifyTebexSignature(`${rawBody} `, signature, "secret")).toBe(false);
    expect(verifyTebexSignature(rawBody, "short", "secret")).toBe(false);
  });

  test("parses a validated standard webhook envelope", () => {
    expect(parseTebexWebhook(rawBody)).toEqual({
      date: new Date("2026-08-11T12:00:00Z"),
      id: "delivery-1",
      subject: { transaction_id: "tbx-1" },
      type: "payment.completed",
    });
  });

  test("rejects malformed webhook envelopes", () => {
    expect(() => parseTebexWebhook('{"type":"payment.completed"}')).toThrow();
  });
});
