import { describe, expect, test } from "bun:test";

import { startProviderMockServer } from "../../test-support/provider-mocks/server.ts";

describe("provider mock server", () => {
  test("serves deterministic CFX, Steam, and Tebex contracts", async () => {
    const mock = startProviderMockServer();

    try {
      const cfx = await fetch(`${mock.origin}/session/current.json`).then((response) =>
        response.json(),
      );
      const steam = await fetch(`${mock.origin}/steam/profile`).then((response) => response.json());
      const tebex = await fetch(`${mock.origin}/api/accounts/testbed-public-token/packages`).then(
        (response) => response.json(),
      );

      expect(cfx.current_user.username).toBe("homestead-player");
      expect(steam.response.players[0].steamid).toBe("76561198000000000");
      expect(tebex.data[0].id).toBe(1001);
    } finally {
      await mock.stop();
    }
  });
});
