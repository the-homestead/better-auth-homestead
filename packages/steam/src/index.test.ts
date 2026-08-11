import { describe, expect, test } from "bun:test";
import { createPluginTestInstance } from "@itzdabbzz/better-auth-plugin-kit";

import { steam } from "./index.ts";

describe("steam", () => {
  test("exposes a stable Better Auth plugin id", () => {
    expect(steam({ steamApiKey: "test-api-key" }).id).toBe("steam");
  });

  test("registers sign-in, callback, and linking endpoints", () => {
    const plugin = steam({ accountLinking: true, steamApiKey: "test-api-key" });

    expect(Object.keys(plugin.endpoints ?? {})).toEqual([
      "signInWithSteam",
      "steamCallback",
      "linkAccountWithSteam",
    ]);
  });

  test("installs in a Better Auth test instance", async () => {
    const plugin = steam({ steamApiKey: "test-api-key" });
    const instance = await createPluginTestInstance(plugin);

    try {
      expect(instance.auth.options.plugins?.some(({ id }) => id === plugin.id)).toBe(true);
    } finally {
      instance.close();
    }
  });
});
