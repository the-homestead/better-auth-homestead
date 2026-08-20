import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { validatePackage } from "./check-packages.ts";

const temporaryRoots: string[] = [];

async function createPackage(files: Record<string, string>): Promise<string> {
  const packageDir = await mkdtemp(join(tmpdir(), "better-auth-package-"));
  temporaryRoots.push(packageDir);

  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const destination = join(packageDir, path);
      await mkdir(join(destination, ".."), { recursive: true });
      await writeFile(destination, content);
    }),
  );

  return packageDir;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true })));
});

describe("validatePackage", () => {
  test("accepts a complete built plugin package", async () => {
    const packageDir = await createPackage({
      "CHANGELOG.md": "# Changelog\n",
      LICENSE: "MIT\n",
      "README.md": "# Plugin\n",
      "dist/index.d.ts": "export declare function plugin(): unknown;\n",
      "dist/index.js": "export function plugin() {}\n",
      "package.json": JSON.stringify({
        name: "@homestead/ba-example",
        version: "0.0.0",
        private: true,
        author: "Homestead Systems <dabz@homestead.systems>",
        files: ["dist", "CHANGELOG.md", "LICENSE", "README.md"],
        exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
        peerDependencies: { "better-auth": ">=1.6.0 <2" },
        publishConfig: { access: "public", provenance: true },
        repository: { type: "git", url: "git+https://github.com/example/repo.git" },
      }),
    });

    expect(await validatePackage(packageDir)).toEqual([]);
  });

  test("reports missing build output and leaked tests", async () => {
    const packageDir = await createPackage({
      "dist/index.test.js": "throw new Error('leaked');\n",
      "package.json": JSON.stringify({
        name: "@homestead/ba-example",
        private: true,
        files: ["dist"],
        exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } },
        publishConfig: { access: "public" },
      }),
    });

    const errors = await validatePackage(packageDir);

    expect(errors).toContain("missing export target: dist/index.js");
    expect(errors).toContain("missing export target: dist/index.d.ts");
    expect(errors).toContain("test file leaked into dist: dist/index.test.js");
  });

  test("validates every package subpath export", async () => {
    const packageDir = await createPackage({
      "dist/index.d.ts": "export {};\n",
      "dist/index.js": "export {};\n",
      "package.json": JSON.stringify({
        name: "@homestead/ba-example",
        private: true,
        exports: {
          ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
          "./client": { types: "./dist/client.d.ts", import: "./dist/client.js" },
        },
      }),
    });

    const errors = await validatePackage(packageDir);

    expect(errors).toContain("missing export target: dist/client.js");
    expect(errors).toContain("missing export target: dist/client.d.ts");
  });
});
