import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createTebexSignature } from "@itzdabbzz/better-auth-tebex";
import crypto from "node:crypto";

import { createTestbedAuth } from "../../test-support/test-auth.ts";
import { startProviderMockServer } from "../../test-support/provider-mocks/server.ts";

type AuthInstance = Awaited<ReturnType<typeof createTestbedAuth>>;
type ProviderMock = ReturnType<typeof startProviderMockServer>;

let instance: AuthInstance;
let providers: ProviderMock;

beforeEach(async () => {
  providers = startProviderMockServer();
  instance = await createTestbedAuth(providers.providerURLs);
});

afterEach(async () => {
  instance.close();
  await providers.stop();
});

function anonymousPost(path: string, body: unknown) {
  return instance.auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      method: "POST",
    }),
  );
}

describe("complete provider flows", () => {
  test("signs in through the mocked Steam OpenID callback", async () => {
    const initiation = await anonymousPost("/sign-in/steam", {
      callbackURL: "/",
      disableRedirect: true,
      errorCallbackURL: "/error",
    });
    const providerURL = new URL((await initiation.json()).url);
    const returnTo = providerURL.searchParams.get("openid.return_to");
    if (!returnTo) throw new Error("Steam initiation omitted openid.return_to");

    const callback = new URL(returnTo);
    callback.searchParams.set(
      "openid.claimed_id",
      "https://steamcommunity.com/openid/id/76561198000000000",
    );
    callback.searchParams.set("openid.identity", callback.searchParams.get("openid.claimed_id")!);
    callback.searchParams.set("openid.mode", "id_res");
    callback.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
    callback.searchParams.set("openid.op_endpoint", `${providers.origin}/steam/openid/login`);
    callback.searchParams.set("openid.return_to", returnTo);

    const response = await instance.auth.handler(new Request(callback));
    const user = await instance.context.internalAdapter.findUserByEmail(
      "steam_76561198000000000@steam.local",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token");
    expect(user?.user.name).toBe("Homestead Player");
  });

  test("signs in through the mocked CFX callback", async () => {
    const initiation = await anonymousPost("/cfx/initiate", {
      callbackURL: "/",
      errorCallbackURL: "/error",
    });
    const providerURL = new URL((await initiation.json()).url);
    const authRedirect = providerURL.searchParams.get("auth_redirect");
    const publicKey = providerURL.searchParams.get("public_key");
    const nonce = providerURL.searchParams.get("nonce");
    if (!authRedirect || !publicKey || !nonce) throw new Error("CFX initiation was incomplete");

    const payload = crypto
      .publicEncrypt(
        { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
        Buffer.from(JSON.stringify({ key: "test-user-api-key", nonce })),
      )
      .toString("base64");
    const callback = new URL(authRedirect);
    callback.searchParams.set("payload", payload);

    const response = await instance.auth.handler(new Request(callback));
    const user = await instance.context.internalAdapter.findUserByEmail("player@homestead.test");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/?cfx=signed-in");
    expect(response.headers.get("set-cookie")).toContain("better-auth.session_token");
    expect(user?.user.name).toBe("Homestead Player");
  });

  test("creates a mocked Tebex checkout and accepts a signed webhook", async () => {
    const user = await instance.test.saveUser(
      instance.test.createUser({ email: "buyer@homestead.test", name: "Buyer" }),
    );
    const headers = await instance.test.getAuthHeaders({ userId: user.id });
    headers.set("content-type", "application/json");
    headers.set("origin", "http://localhost:3000");
    const checkout = await instance.auth.handler(
      new Request("http://localhost:3000/api/auth/tebex/checkout", {
        body: JSON.stringify({ callbackURL: "/", cancelURL: "/", packageId: 1001 }),
        headers,
        method: "POST",
      }),
    );

    expect(checkout.status).toBe(200);
    expect((await checkout.json()).url).toBe(`${providers.origin}/tebex/checkout/testbed-basket`);

    const rawBody = JSON.stringify({
      date: "2026-08-13T12:00:00.000Z",
      id: "testbed-validation",
      subject: {},
      type: "validation.webhook",
    });
    const webhook = await instance.auth.handler(
      new Request("http://localhost:3000/api/auth/tebex/webhook", {
        body: rawBody,
        headers: {
          "content-type": "application/json",
          "x-signature": createTebexSignature(rawBody, "testbed-webhook-secret"),
        },
        method: "POST",
      }),
    );

    expect(webhook.status).toBe(200);
    expect(await webhook.json()).toEqual({ id: "testbed-validation" });
  });
});
