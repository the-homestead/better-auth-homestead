import { describe, expect, mock, test } from "bun:test";

import { createTebexClient, getBasketCheckoutURL } from "./provider.ts";

function response(data: unknown): Response {
  return Response.json(data);
}

function requestURL(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== "string") throw new TypeError("Expected a string request body");
  return init.body;
}

describe("createTebexClient", () => {
  test("lists validated categories with private Basic authentication", async () => {
    const request = mock(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response({ data: [{ id: 1, name: "Ranks", packages: [] }] }),
    );
    const client = createTebexClient({
      fetch: request,
      privateKey: "secret",
      publicToken: "store-token",
    });

    expect(await client.listCategories(true)).toEqual([{ id: 1, name: "Ranks", packages: [] }]);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0]!;
    expect(requestURL(url)).toBe(
      "https://headless.tebex.io/api/accounts/store-token/categories?includePackages=1",
    );
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Basic ${Buffer.from("store-token:secret").toString("base64")}`,
    );
  });

  test("creates a correlated basket and adds an allowlisted package", async () => {
    const request = mock(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = requestURL(input);
      return url.endsWith("/baskets")
        ? response({ data: { ident: "basket-1", links: {} } })
        : response({
            ident: "basket-1",
            links: { checkout: "https://checkout.tebex.io/basket-1" },
          });
    });
    const client = createTebexClient({
      fetch: request,
      privateKey: "secret",
      publicToken: "store-token",
    });

    await client.createBasket({
      cancelURL: "https://app.example.com/cancel",
      completeURL: "https://app.example.com/complete",
      custom: { checkoutReference: "opaque-reference", version: 1 },
      ipAddress: "127.0.0.1",
      userIdentifier: { field: "user_id", value: "fivem:123" },
    });
    const basket = await client.addPackage("basket-1", { packageId: 42, quantity: 2 });

    const [, createInit] = request.mock.calls[0]!;
    expect(JSON.parse(requestBody(createInit))).toMatchObject({
      cancel_url: "https://app.example.com/cancel",
      complete_url: "https://app.example.com/complete",
      custom: { checkoutReference: "opaque-reference", version: 1 },
      ip_address: "127.0.0.1",
      user_id: "fivem:123",
    });
    expect(JSON.parse(requestBody(request.mock.calls[1]?.[1]))).toEqual({
      package_id: "42",
      quantity: 2,
    });
    expect(getBasketCheckoutURL(basket)).toBe("https://checkout.tebex.io/basket-1");
  });

  test("returns the first Tebex player authentication link", async () => {
    const request = mock(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      response([{ name: "FiveM", url: "https://ident.tebex.io/fivem" }]),
    );
    const client = createTebexClient({
      fetch: request,
      privateKey: "secret",
      publicToken: "store-token",
    });

    expect(await client.getAuthURL("basket/unsafe", "https://app.example.com/return")).toBe(
      "https://ident.tebex.io/fivem",
    );
    expect(requestURL(request.mock.calls[0]![0])).toContain("basket%2Funsafe/auth");
  });

  test("rejects malformed provider responses", async () => {
    const client = createTebexClient({
      fetch: mock(async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response({ data: [{ id: "not-a-number" }] }),
      ),
      privateKey: "secret",
      publicToken: "store-token",
    });

    expect(client.listPackages()).rejects.toThrow();
  });
});
