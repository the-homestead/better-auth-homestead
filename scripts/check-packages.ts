import { access, readFile, readdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

interface PackageManifest {
  author?: unknown;
  exports?: Record<string, { import?: string; types?: string }>;
  files?: unknown;
  name?: unknown;
  peerDependencies?: Record<string, string>;
  private?: boolean;
  publishConfig?: { access?: string; provenance?: boolean };
  repository?: unknown;
}

function isPackageManifest(value: unknown): value is PackageManifest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseManifest(content: string): PackageManifest {
  const value: unknown = JSON.parse(content);
  if (!isPackageManifest(value)) throw new Error("package.json must contain an object");
  return value;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory: string, base = directory): Promise<string[]> {
  if (!(await exists(directory))) return [];

  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? listFiles(path, base)
        : [relative(base, path).split(sep).join("/")];
    }),
  );
  return nested.flat().toSorted();
}

export async function validatePackage(packageDir: string): Promise<string[]> {
  const errors: string[] = [];
  const manifest = parseManifest(await readFile(join(packageDir, "package.json"), "utf8"));
  const exportEntries = Object.entries(manifest.exports ?? {});
  const exportErrors = await Promise.all(
    exportEntries.flatMap(([subpath, conditions]) =>
      [conditions.import, conditions.types].map(async (target) => {
        if (!target) return `missing import or type target for export: ${subpath}`;
        const normalizedTarget = target.replace(/^\.\//, "");
        return (await exists(join(packageDir, normalizedTarget)))
          ? undefined
          : `missing export target: ${normalizedTarget}`;
      }),
    ),
  );
  if (exportEntries.length === 0) errors.push("package must define exports");
  errors.push(...exportErrors.filter((error) => error !== undefined));

  for (const file of await listFiles(join(packageDir, "dist"))) {
    if (/(^|\/)\w[^/]*\.test\./.test(file)) {
      errors.push(`test file leaked into dist: dist/${file}`);
    }
  }

  if (manifest.publishConfig) {
    const missingPublishFiles = await Promise.all(
      ["CHANGELOG.md", "LICENSE", "README.md"].map(async (file) =>
        (await exists(join(packageDir, file))) ? undefined : `missing publish file: ${file}`,
      ),
    );
    errors.push(...missingPublishFiles.filter((error) => error !== undefined));
    if (typeof manifest.author !== "string" || !manifest.author.includes("Homestead Systems")) {
      errors.push("author must identify Homestead Systems");
    }
    if (!manifest.repository) errors.push("repository metadata is required");
    if (!manifest.peerDependencies?.["better-auth"]) {
      errors.push("better-auth must be a peer dependency");
    }
    if (manifest.publishConfig.access !== "public") {
      errors.push("publishConfig.access must be public");
    }
    if (manifest.publishConfig.provenance !== true) {
      errors.push("publishConfig.provenance must be true");
    }
    if (!Array.isArray(manifest.files) || !manifest.files.includes("dist")) {
      errors.push("package files must include dist");
    }
  }

  return errors;
}

async function checkPackedContents(packageDir: string): Promise<string[]> {
  const process = Bun.spawn(["bun", "pm", "pack", "--dry-run", "--ignore-scripts"], {
    cwd: packageDir,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  if (exitCode !== 0) return [`bun pm pack failed: ${stderr.trim() || stdout.trim()}`];

  return stdout
    .split(/\r?\n/)
    .filter((line) => /^packed .*\b(src|node_modules|coverage)\//.test(line))
    .map((line) => `unexpected packed file: ${line.replace(/^packed\s+/, "")}`);
}

export async function checkPackages(rootDir = resolve(import.meta.dir, "..")): Promise<void> {
  const packagesDir = join(rootDir, "packages");
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const failures: string[] = [];
  let checked = 0;

  const results = await Promise.all(
    entries
      .filter((item) => item.isDirectory())
      .map(async (entry) => {
        const packageDir = join(packagesDir, entry.name);
        if (!(await exists(join(packageDir, "package.json")))) return undefined;

        const manifest = parseManifest(await readFile(join(packageDir, "package.json"), "utf8"));
        const errors = await validatePackage(packageDir);
        if (manifest.publishConfig) errors.push(...(await checkPackedContents(packageDir)));
        return errors.map((error) => `${String(manifest.name)}: ${error}`);
      }),
  );
  const checkedResults = results.filter((result) => result !== undefined);
  checked = checkedResults.length;
  failures.push(...checkedResults.flat());

  if (failures.length > 0) {
    throw new Error(`Package validation failed:\n- ${failures.join("\n- ")}`);
  }

  console.log(`Validated ${checked} package workspaces.`);
}

if (import.meta.main) {
  await checkPackages();
}
