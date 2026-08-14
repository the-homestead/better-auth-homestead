import { expect, test } from "@playwright/test";

test("authenticates a player with every Homestead plugin mounted", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Homestead Better Auth Testbed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Steam" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CFX" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tebex" })).toBeVisible();

  const email = `browser-${Date.now()}@homestead.test`;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Test status")).toContainText(`Signed in as ${email}`);

  await page.getByRole("button", { name: "Check session" }).click();
  await expect(page.getByLabel("Test status")).toContainText(`Active session: ${email}`);

  const tebex = await page.request.get("/api/auth/tebex/packages");
  expect(tebex.status()).toBe(200);
  expect(await tebex.json()).toEqual([expect.objectContaining({ id: 1001 })]);

  const steam = await page.request.post("/api/auth/sign-in/steam", {
    data: { callbackURL: "/", disableRedirect: true, errorCallbackURL: "/" },
    headers: { origin: "http://127.0.0.1:3000" },
  });
  expect(steam.status()).toBe(200);
  expect((await steam.json()).url).toContain("localhost:43112/steam/openid/login");

  const cfx = await page.request.post("/api/auth/cfx/initiate", {
    data: { callbackURL: "/", errorCallbackURL: "/" },
    headers: { origin: "http://127.0.0.1:3000" },
  });
  expect(cfx.status()).toBe(200);
  expect((await cfx.json()).url).toContain("localhost:43112/user-api-key/new");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByLabel("Test status")).toContainText("Signed out");
});
