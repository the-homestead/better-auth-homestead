import { describe, expect, test } from "bun:test";
import { createPluginTestInstance } from "@itzdabbzz/better-auth-plugin-kit";

import { steam } from "./index.ts";

describe("steam", () => {
  test("exposes a stable Better Auth plugin id", () => {
    expect(steam().id).toBe("steam");
  });

  test("installs in a Better Auth test instance", async () => {
    const plugin = steam();
    const instance = await createPluginTestInstance(plugin);

    try {
      expect(instance.auth.options.plugins?.some(({ id }) => id === plugin.id)).toBe(true);
    } finally {
      instance.close();
    }
  });
});
