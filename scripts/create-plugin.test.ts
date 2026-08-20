import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPlugin } from "./create-plugin.ts";

const temporaryRoots: string[] = [];

async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "better-auth-homestead-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("createPlugin", () => {
  test("creates a substituted plugin workspace", async () => {
    const rootDir = await createTemporaryRoot();
    const templateDir = join(import.meta.dir, "..", "templates", "plugin");

    const result = await createPlugin({ name: "discord-accounts", rootDir, templateDir });

    expect(result.destination).toBe(join(rootDir, "packages", "discord-accounts"));
    expect(result.files).toContain("src/index.ts");

    const manifest = await readFile(join(result.destination, "package.json"), "utf8");
    const source = await readFile(join(result.destination, "src", "index.ts"), "utf8");
    const readme = await readFile(join(result.destination, "README.md"), "utf8");

    expect(manifest).toContain('"name": "@homestead/ba-discord-accounts"');
    expect(source).toContain('id: "discord-accounts"');
    expect(source).toContain("discordAccounts");
    expect(readme).toContain("Better Auth Discord Accounts");
    expect(readme).not.toContain("{{");
  });

  test.each(["", "Steam", "steam_plugin", "../steam", "a/b", "-steam", "plugin-kit"])(
    "rejects the invalid or reserved name %p",
    async (name) => {
      const rootDir = await createTemporaryRoot();
      const templateDir = join(import.meta.dir, "..", "templates", "plugin");

      expect(createPlugin({ name, rootDir, templateDir })).rejects.toThrow("plugin name");
    },
  );

  test("does not overwrite an existing package", async () => {
    const rootDir = await createTemporaryRoot();
    const destination = join(rootDir, "packages", "steam");
    const templateDir = join(import.meta.dir, "..", "templates", "plugin");
    await mkdir(destination, { recursive: true });

    expect(createPlugin({ name: "steam", rootDir, templateDir })).rejects.toThrow("already exists");
  });
});
