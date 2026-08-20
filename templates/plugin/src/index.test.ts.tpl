import { describe, expect, test } from "bun:test";
import { createPluginTestInstance } from "@homestead/ba-plugin-kit";

import { {{PLUGIN_FUNCTION_NAME}} } from "./index.ts";

describe("{{PLUGIN_FUNCTION_NAME}}", () => {
  test("exposes a stable Better Auth plugin id", () => {
    expect({{PLUGIN_FUNCTION_NAME}}().id).toBe("{{PLUGIN_NAME}}");
  });

  test("installs in a Better Auth test instance", async () => {
    const plugin = {{PLUGIN_FUNCTION_NAME}}();
    const instance = await createPluginTestInstance(plugin);

    try {
      expect(instance.auth.options.plugins?.some(({ id }) => id === plugin.id)).toBe(true);
    } finally {
      instance.close();
    }
  });
});
