import { describe, expect, test } from "bun:test";

import { cfxClient } from "./client.ts";

describe("cfxClient", () => {
  test("maps mutating CFX endpoints to POST", () => {
    const plugin = cfxClient();

    expect(plugin.id).toBe("cfx");
    expect(plugin.pathMethods).toEqual({
      "/cfx/initiate": "POST",
      "/cfx/unlink": "POST",
    });
  });
});
