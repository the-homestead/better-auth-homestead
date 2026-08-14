import { describe, expect, test } from "bun:test";

import { createTestbedPlugins } from "../../test-support/plugins.ts";

describe("testbed plugin configuration", () => {
  test("installs every Homestead server plugin exactly once", () => {
    expect(createTestbedPlugins().map(({ id }) => id)).toEqual(["cfx", "steam", "tebex"]);
  });
});
