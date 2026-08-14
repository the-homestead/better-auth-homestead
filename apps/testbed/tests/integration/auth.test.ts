import { describe, expect, test } from "bun:test";

import { createTestbedAuth } from "../../test-support/test-auth.ts";

describe("combined Better Auth instance", () => {
  test("migrates every plugin and serves an authenticated session", async () => {
    const instance = await createTestbedAuth();

    try {
      const user = await instance.test.saveUser(
        instance.test.createUser({ email: "player@homestead.test", name: "Player One" }),
      );
      const login = await instance.test.login({ userId: user.id });
      const response = await instance.auth.handler(
        new Request("http://localhost:3000/api/auth/get-session", {
          headers: login.headers,
        }),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ user: { email: "player@homestead.test" } });

      const models = ["cfxAccount", "tebexBasket", "tebexEntitlement"] as const;
      const records = await Promise.all(
        models.map((model) => instance.context.adapter.findMany({ model, where: [] })),
      );
      expect(records).toEqual([[], [], []]);
    } finally {
      instance.close();
    }
  });
});
