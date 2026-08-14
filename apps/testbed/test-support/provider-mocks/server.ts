const steamId = "76561198000000000";

const player = {
  avatar_template: "/user_avatar/forum.cfx.re/homestead-player/{size}/1.png",
  email: "player@homestead.test",
  id: 42,
  name: "Homestead Player",
  username: "homestead-player",
};

const tebexPackage = {
  base_price: 9.99,
  currency: "USD",
  description: "Deterministic test entitlement",
  id: 1001,
  name: "Testbed VIP",
  total_price: 9.99,
};

function json(value: unknown, status = 200) {
  return Response.json(value, { status });
}

export function startProviderMockServer(port = 0) {
  const server = Bun.serve({
    hostname: "localhost",
    port,
    async fetch(request): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === "/health") return json({ ready: true });

      if (url.pathname === "/session/current.json") {
        return json({ current_user: player });
      }
      if (url.pathname === `/users/${player.username}.json`) {
        return json({ user: { email: player.email } });
      }
      if (url.pathname === "/user-api-key/revoke" && request.method === "POST") {
        return json({ success: "OK" });
      }
      if (url.pathname === "/steam/openid/login" && request.method === "POST") {
        return new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n");
      }
      if (url.pathname === "/steam/profile") {
        return json({
          response: {
            players: [
              {
                avatarfull: "https://avatars.homestead.test/player.jpg",
                personaname: "Homestead Player",
                steamid: steamId,
              },
            ],
          },
        });
      }

      const accountRoot = "/api/accounts/testbed-public-token";
      if (url.pathname === accountRoot) {
        return json({ data: { currency: "USD", id: 1, name: "Homestead Test Store" } });
      }
      if (url.pathname === `${accountRoot}/categories`) {
        return json({
          data: [{ id: 10, name: "Memberships", packages: [tebexPackage], slug: "memberships" }],
        });
      }
      if (url.pathname === `${accountRoot}/packages`) {
        return json({ data: [tebexPackage] });
      }
      if (url.pathname === `${accountRoot}/packages/1001`) {
        return json({ data: tebexPackage });
      }
      if (url.pathname === `${accountRoot}/baskets` && request.method === "POST") {
        const body: unknown = await request.json();
        const custom =
          typeof body === "object" && body !== null && "custom" in body ? body.custom : undefined;
        return json({
          data: {
            complete: false,
            custom: typeof custom === "object" && custom !== null ? custom : {},
            ident: "testbed-basket",
            links: { checkout: `${url.origin}/tebex/checkout/testbed-basket` },
          },
        });
      }
      if (url.pathname === "/api/baskets/testbed-basket/packages" && request.method === "POST") {
        return json({
          data: {
            complete: false,
            ident: "testbed-basket",
            links: { checkout: `${url.origin}/tebex/checkout/testbed-basket` },
          },
        });
      }

      return json({ error: `No mock route for ${request.method} ${url.pathname}` }, 404);
    },
  });

  const origin = `http://localhost:${server.port}`;
  return {
    origin,
    providerURLs: {
      cfx: origin,
      steamOpenID: `${origin}/steam/openid/login`,
      steamProfile: `${origin}/steam/profile`,
      tebex: `${origin}/api/`,
    },
    stop: () => server.stop(true),
  };
}
