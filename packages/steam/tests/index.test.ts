import { describe, expect, test } from "bun:test";
import { createPluginTestInstance } from "@homestead-systems/ba-plugin-kit";

import { STEAM_ERROR_CODES, steam } from "../src/index.ts";

describe("steam", () => {
  test("exposes a stable Better Auth plugin id", () => {
    expect(steam({ steamApiKey: "test-api-key" }).id).toBe("steam");
  });

  test("registers sign-in, callback, linking, and unlinking endpoints", () => {
    const plugin = steam({ accountLinking: true, steamApiKey: "test-api-key" });

    expect(Object.keys(plugin.endpoints ?? {})).toEqual([
      "signInWithSteam",
      "steamCallback",
      "linkAccountWithSteam",
      "unlinkSteamAccount",
    ]);
  });

  test("adds a unique steamId user field and structured error codes", () => {
    const plugin = steam({ steamApiKey: "test-api-key" });

    expect(plugin.schema?.user?.fields.steamId).toMatchObject({
      input: false,
      required: false,
      returned: true,
      type: "string",
      unique: true,
    });
    expect(plugin.$ERROR_CODES).toBe(STEAM_ERROR_CODES);
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
