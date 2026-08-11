import { describe, expect, test } from "bun:test";
import { createPluginTestInstance } from "@itzdabbzz/better-auth-plugin-kit";

import { TEBEX_ERROR_CODES, tebex } from "../src/index.ts";

const options = {
  packageMappings: [{ entitlements: ["supporter"], packageId: 42 }],
  privateKey: "private-key",
  publicToken: "public-token",
  webhookAllowedIPs: false as const,
  webhookSecret: "webhook-secret",
};

describe("tebex", () => {
  test("exposes the complete Better Auth plugin contract", () => {
    const plugin = tebex(options);

    expect(plugin.id).toBe("tebex");
    expect(Object.keys(plugin.endpoints ?? {})).toEqual([
      "getTebexStore",
      "listTebexCategories",
      "listTebexPackages",
      "getTebexPackage",
      "createTebexCheckout",
      "tebexAuthCallback",
      "receiveTebexWebhook",
      "listTebexPayments",
      "listTebexRecurringPayments",
      "listTebexEntitlements",
      "checkTebexEntitlement",
    ]);
    expect(Object.keys(plugin.schema ?? {})).toEqual([
      "tebexCustomer",
      "tebexPlayerIdentity",
      "tebexBasket",
      "tebexPayment",
      "tebexRecurringPayment",
      "tebexEntitlement",
      "tebexWebhookDelivery",
    ]);
    expect(plugin.$ERROR_CODES).toBe(TEBEX_ERROR_CODES);
  });

  test("installs with Better Auth migrations", async () => {
    const instance = await createPluginTestInstance(tebex(options));
    try {
      expect(instance.auth.options.plugins?.some(({ id }) => id === "tebex")).toBe(true);
    } finally {
      instance.close();
    }
  });

  test("rejects missing credentials and empty package mappings", () => {
    expect(() => tebex({ ...options, privateKey: "" })).toThrow("privateKey");
    expect(() => tebex({ ...options, packageMappings: [] })).toThrow("packageMappings");
  });
});
