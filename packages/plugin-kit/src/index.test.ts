import { describe, expect, test } from "bun:test";

import { createPluginTestInstance } from "./index.ts";

describe("createPluginTestInstance", () => {
  test("provides Better Auth's test helpers with Bun SQLite", async () => {
    const instance = await createPluginTestInstance({ id: "example" });

    try {
      const user = instance.test.createUser({ email: "plugin@example.com" });
      const savedUser = await instance.test.saveUser(user);

      expect(savedUser.email).toBe("plugin@example.com");
      expect(instance.auth.options.plugins?.some(({ id }) => id === "example")).toBe(true);
    } finally {
      instance.close();
    }
  });
});
