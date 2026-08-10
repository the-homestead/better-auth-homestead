import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { testUtils } from "better-auth/plugins";
import { Database } from "bun:sqlite";

/** Creates an isolated Better Auth instance backed by Bun's in-memory SQLite database. */
export async function createPluginTestInstance(plugin: BetterAuthPlugin) {
  const database = new Database(":memory:");
  const options = {
    baseURL: "http://localhost:3000",
    database,
    emailAndPassword: { enabled: true },
    plugins: [testUtils(), plugin],
    secret: "better-auth-homestead-test-secret-with-32-characters",
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
