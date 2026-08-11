import { describe, expect, test } from "bun:test";

import { steamClient } from "./client.ts";

describe("steamClient", () => {
  test("infers the server plugin and maps mutating endpoints to POST", () => {
    const plugin = steamClient();

    expect(plugin.id).toBe("steam");
    expect(plugin.pathMethods).toEqual({
      "/link-social/steam": "POST",
      "/sign-in/steam": "POST",
      "/unlink-social/steam": "POST",
    });
  });
});
