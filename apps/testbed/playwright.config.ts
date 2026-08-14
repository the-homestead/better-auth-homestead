import { defineConfig } from "@playwright/test";

const providerOrigin = "http://localhost:43112";
const appOrigin = "http://127.0.0.1:3000";

export default defineConfig({
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e",
  use: {
    baseURL: appOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "bun run provider:mock",
      reuseExistingServer: false,
      timeout: 30_000,
      url: `${providerOrigin}/health`,
    },
    {
      command: "bun run dev -- --port 3000",
      env: {
        BETTER_AUTH_SECRET: "homestead-browser-e2e-secret-at-least-32-characters",
        BETTER_AUTH_URL: appOrigin,
        TESTBED_CFX_URL: providerOrigin,
        TESTBED_DATABASE_PATH: `.data/browser-e2e-${process.pid}.sqlite`,
        TESTBED_STEAM_OPENID_URL: `${providerOrigin}/steam/openid/login`,
        TESTBED_STEAM_PROFILE_URL: `${providerOrigin}/steam/profile`,
        TESTBED_TEBEX_URL: `${providerOrigin}/api/`,
      },
      reuseExistingServer: false,
      timeout: 60_000,
      url: appOrigin,
    },
  ],
  workers: 1,
});
