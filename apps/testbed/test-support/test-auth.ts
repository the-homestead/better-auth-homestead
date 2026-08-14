import { createTestbedPlugins, type TestbedProviderURLs } from "./plugins.ts";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { testUtils } from "better-auth/plugins";
import { Database } from "bun:sqlite";

export async function createTestbedAuth(providerURLs?: TestbedProviderURLs) {
  const database = new Database(":memory:");
  const options = {
    account: { accountLinking: { allowUnlinkingAll: true, enabled: true } },
    baseURL: "http://localhost:3000",
    database,
    emailAndPassword: { enabled: true },
    plugins: [testUtils(), ...createTestbedPlugins(providerURLs)],
    secret: "homestead-testbed-secret-that-is-at-least-32-characters",
    trustedOrigins: ["http://localhost:3000"],
  } satisfies BetterAuthOptions;

  try {
    const { runMigrations } = await getMigrations(options);
    await runMigrations();
    const auth = betterAuth(options);
    const context = await auth.$context;

    return {
      auth,
      close: () => database.close(),
      context,
      test: context.test,
    };
  } catch (error) {
    database.close();
    throw error;
  }
}
