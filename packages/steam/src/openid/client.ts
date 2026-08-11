import { z } from "zod";

/** Steam OpenID and Web API provider primitives. */

export const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";
export const STEAM_PROFILE_URL =
  "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/";

const STEAM_ID_PATTERN = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const identifierSelect = "http://specs.openid.net/auth/2.0/identifier_select";

const steamProfileSchema = z.object({
  avatar: z.string().optional(),
  avatarfull: z.string().optional(),
  personaname: z.string().optional(),
  profileurl: z.string().optional(),
  realname: z.string().optional(),
  steamid: z.string().regex(/^\d{17}$/),
});

const steamProfileResponseSchema = z.object({
  response: z.object({ players: z.array(steamProfileSchema) }),
});

export type SteamProfile = z.infer<typeof steamProfileSchema>;

export function buildSteamOpenIDURL(realm: string, returnTo: string): URL {
  const url = new URL(STEAM_OPENID_URL);
  url.search = new URLSearchParams({
    "openid.claimed_id": identifierSelect,
    "openid.identity": identifierSelect,
    "openid.mode": "checkid_setup",
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.realm": realm,
    "openid.return_to": returnTo,
  }).toString();
  return url;
}

function parseVerificationResponse(value: string): ReadonlyMap<string, string> {
  const entries = value
    .split(/\r?\n/)
    .map((line) => line.split(":", 2))
    .filter((entry): entry is [string, string] => entry.length === 2);
  return new Map(entries);
}

export async function verifySteamOpenIDResponse(params: URLSearchParams): Promise<string> {
  if (params.get("openid.op_endpoint") !== STEAM_OPENID_URL) {
    throw new Error("Steam OpenID provider endpoint is invalid");
  }

  const claimedId = params.get("openid.claimed_id");
  const match = claimedId?.match(STEAM_ID_PATTERN);
  if (!match?.[1]) {
    throw new Error("Steam OpenID claimed_id is invalid");
  }

  const verificationParams = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith("openid.")) verificationParams.set(key, value);
  }
  verificationParams.set("openid.mode", "check_authentication");

  const response = await fetch(STEAM_OPENID_URL, {
    body: verificationParams,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Steam OpenID verification failed with HTTP ${response.status}`);
  }

  const verification = parseVerificationResponse(await response.text());
  if (verification.get("is_valid") !== "true") {
    throw new Error("Steam OpenID verification returned an invalid assertion");
  }

  return match[1];
}

export async function fetchSteamProfile(
  steamApiKey: string,
  steamId: string,
): Promise<SteamProfile> {
  const url = new URL(STEAM_PROFILE_URL);
  url.searchParams.set("key", steamApiKey);
  url.searchParams.set("steamids", steamId);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Steam profile request failed with HTTP ${response.status}`);
  }

  const payload = steamProfileResponseSchema.parse(await response.json());
  const profile = payload.response.players[0];
  if (!profile || profile.steamid !== steamId) {
    throw new Error("Steam profile response did not contain the requested player");
  }

  return profile;
}
