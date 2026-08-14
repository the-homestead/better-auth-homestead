import { createTestbedPlugins } from "../../test-support/plugins.ts";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const databasePath = resolve(process.env.TESTBED_DATABASE_PATH ?? ".data/testbed.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const providerURLs = {
  cfx: process.env.TESTBED_CFX_URL ?? "http://localhost:43111",
  steamOpenID: process.env.TESTBED_STEAM_OPENID_URL ?? "http://localhost:43113/steam/openid/login",
  steamProfile: process.env.TESTBED_STEAM_PROFILE_URL ?? "http://localhost:43113/steam/profile",
  tebex: process.env.TESTBED_TEBEX_URL ?? "http://localhost:43112/api/",
};

const authOptions = {
  account: { accountLinking: { allowUnlinkingAll: true, enabled: true } },
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: new Database(databasePath),
  emailAndPassword: { enabled: true },
  plugins: [...createTestbedPlugins(providerURLs)],
  secret:
    process.env.BETTER_AUTH_SECRET ?? "homestead-testbed-development-secret-at-least-32-characters",
  trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
};

const { runMigrations } = await getMigrations(authOptions);
await runMigrations();

export const auth = betterAuth(authOptions);
