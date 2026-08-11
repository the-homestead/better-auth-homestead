import { describe, expect, test } from "bun:test";

import { tebexSchema } from "../src/database/schema.ts";

describe("tebexSchema", () => {
  test("defines durable billing and webhook models", () => {
    expect(Object.keys(tebexSchema)).toEqual([
      "tebexCustomer",
      "tebexPlayerIdentity",
      "tebexBasket",
      "tebexPayment",
      "tebexRecurringPayment",
      "tebexEntitlement",
      "tebexWebhookDelivery",
    ]);
    expect(tebexSchema.tebexBasket.fields.ident).toMatchObject({
      input: false,
      returned: false,
      unique: true,
    });
    expect(tebexSchema.tebexPayment.fields.transactionId.unique).toBe(true);
    expect(tebexSchema.tebexWebhookDelivery.fields.deliveryId.unique).toBe(true);
  });
});
