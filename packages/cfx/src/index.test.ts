import { describe, expect, test } from "bun:test";
import { createPluginTestInstance } from "@itzdabbzz/better-auth-plugin-kit";

import { cfx } from "./index.ts";

describe("cfx", () => {
  test("exposes a stable Better Auth plugin id", () => {
    expect(cfx().id).toBe("cfx");
  });

  test("registers the Cfx.re account schema and endpoints", () => {
    const plugin = cfx();

    expect(plugin.schema?.cfxAccount).toBeDefined();
    expect(Object.keys(plugin.endpoints ?? {})).toEqual([
      "cfxInitiate",
      "cfxCallback",
      "cfxStatus",
      "cfxUnlink",
    ]);
  });

  test("installs in a Better Auth test instance", async () => {
    const plugin = cfx();
    const instance = await createPluginTestInstance(plugin);

    try {
      expect(instance.auth.options.plugins?.some(({ id }) => id === plugin.id)).toBe(true);
    } finally {
      instance.close();
    }
  });
});
