import { afterEach, describe, expect, mock, test } from "bun:test";

import { buildSteamOpenIDURL, fetchSteamProfile, verifySteamOpenIDResponse } from "./openid.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("buildSteamOpenIDURL", () => {
  test("builds a Steam OpenID 2.0 checkid request", () => {
    const url = buildSteamOpenIDURL(
      "https://auth.example.com",
      "https://auth.example.com/api/auth/steam/callback?state=flow",
    );

    expect(url.origin).toBe("https://steamcommunity.com");
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.realm")).toBe("https://auth.example.com");
    expect(url.searchParams.get("openid.return_to")).toContain("state=flow");
  });
});

describe("verifySteamOpenIDResponse", () => {
  test("returns the SteamID64 from a valid Steam assertion", async () => {
    globalThis.fetch = Object.assign(
      mock(async () => new Response("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n")),
      { preconnect: originalFetch.preconnect },
    );
    const params = new URLSearchParams({
      "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000000",
      "openid.mode": "id_res",
      "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    });

    expect(await verifySteamOpenIDResponse(params)).toBe("76561198000000000");
  });

  test.each([
    "http://steamcommunity.com/openid/id/76561198000000000",
    "https://attacker.test/openid/id/76561198000000000",
    "https://steamcommunity.com/openid/id/not-a-steamid",
  ])("rejects an invalid claimed id: %s", async (claimedId) => {
    const params = new URLSearchParams({
      "openid.claimed_id": claimedId,
      "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    });

    expect(verifySteamOpenIDResponse(params)).rejects.toThrow("claimed_id");
  });

  test("requires Steam's exact OpenID endpoint", async () => {
    const params = new URLSearchParams({
      "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000000000",
      "openid.op_endpoint": "https://attacker.test/openid/login",
    });

    expect(verifySteamOpenIDResponse(params)).rejects.toThrow("provider endpoint");
  });
});

describe("fetchSteamProfile", () => {
  test("validates and returns Steam's player summary", async () => {
    globalThis.fetch = Object.assign(
      mock(async () =>
        Response.json({
          response: {
            players: [
              {
                steamid: "76561198000000000",
                personaname: "Player",
                avatarfull: "https://avatars.example.com/player.jpg",
              },
            ],
          },
        }),
      ),
      { preconnect: originalFetch.preconnect },
    );

    expect(await fetchSteamProfile("api-key", "76561198000000000")).toMatchObject({
      steamid: "76561198000000000",
      personaname: "Player",
    });
  });
});
