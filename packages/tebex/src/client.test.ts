import { describe, expect, test } from "bun:test";

import { tebexClient } from "./client.ts";

describe("tebexClient", () => {
  test("maps mutating Tebex endpoints to POST", () => {
    const plugin = tebexClient();
    expect(plugin.id).toBe("tebex");
    expect(plugin.pathMethods).toEqual({
      "/tebex/checkout": "POST",
      "/tebex/entitlements/check": "POST",
    });
  });
});
