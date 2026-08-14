import { startProviderMockServer } from "./server.ts";

const port = Number(process.env.TESTBED_PROVIDER_PORT ?? "43112");
const server = startProviderMockServer(port);

console.log(`Homestead provider mocks listening on ${server.origin}`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
await new Promise(() => undefined);
