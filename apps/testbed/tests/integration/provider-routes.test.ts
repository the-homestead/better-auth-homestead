import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createTestbedAuth } from "../../test-support/test-auth.ts";
import { startProviderMockServer } from "../../test-support/provider-mocks/server.ts";

type AuthInstance = Awaited<ReturnType<typeof createTestbedAuth>>;
type ProviderMock = ReturnType<typeof startProviderMockServer>;

let auth: AuthInstance;
let providers: ProviderMock;

beforeEach(async () => {
  providers = startProviderMockServer();
  auth = await createTestbedAuth(providers.providerURLs);
});

afterEach(async () => {
  auth.close();
  await providers.stop();
});

function post(path: string, body: unknown) {
  return auth.auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      method: "POST",
    }),
  );
}

describe("provider routes", () => {
  test("loads the Tebex catalog from the local provider", async () => {
    const response = await auth.auth.handler(
      new Request("http://localhost:3000/api/auth/tebex/packages"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      expect.objectContaining({ id: 1001, name: "Testbed VIP" }),
    ]);
  });

  test("starts Steam authentication against the local OpenID provider", async () => {
    const response = await post("/sign-in/steam", {
      callbackURL: "/",
      disableRedirect: true,
      errorCallbackURL: "/",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).url).toStartWith(`${providers.origin}/steam/openid/login`);
  });

  test("starts CFX authentication against the local forum provider", async () => {
    const response = await post("/cfx/initiate", {
      callbackURL: "/",
      errorCallbackURL: "/",
    });

    expect(response.status).toBe(200);
    expect((await response.json()).url).toStartWith(`${providers.origin}/user-api-key/new`);
  });
});
