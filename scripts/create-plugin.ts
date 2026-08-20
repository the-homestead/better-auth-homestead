import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export interface CreatePluginOptions {
  name: string;
  rootDir?: string;
  templateDir?: string;
}

export interface CreatePluginResult {
  destination: string;
  files: string[];
}

const RESERVED_NAMES = new Set(["plugin-kit"]);
const TOKEN_PATTERN = /{{([A-Z_]+)}}/g;

function assertValidName(name: string): void {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name) || RESERVED_NAMES.has(name)) {
    throw new Error(
      "Invalid plugin name. Use lowercase kebab-case and avoid reserved plugin names.",
    );
  }
}

function toDisplayName(name: string): string {
  return name
    .split("-")
    .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function toFunctionName(name: string): string {
  const [first = "", ...rest] = name.split("-");
  return `${first}${rest.map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`).join("")}`;
}

async function listTemplateFiles(directory: string, base = directory): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory()
        ? listTemplateFiles(path, base)
        : [relative(base, path).split(sep).join("/")];
    }),
  );

  return files.flat().toSorted();
}

function renderTemplate(content: string, tokens: Readonly<Record<string, string>>): string {
  return content.replaceAll(TOKEN_PATTERN, (_match, token: string) => {
    const value = tokens[token];
    if (value === undefined) {
      throw new Error(`Unknown plugin template token: ${token}`);
    }
    return value;
  });
}

export async function createPlugin(options: CreatePluginOptions): Promise<CreatePluginResult> {
  assertValidName(options.name);

  const rootDir = resolve(options.rootDir ?? join(import.meta.dir, ".."));
  const templateDir = resolve(options.templateDir ?? join(rootDir, "templates", "plugin"));
  const packagesDir = resolve(rootDir, "packages");
  const destination = resolve(packagesDir, options.name);

  if (!destination.startsWith(`${packagesDir}${sep}`)) {
    throw new Error("Invalid plugin name: destination escapes the packages directory.");
  }

  try {
    await access(destination);
    throw new Error(`Plugin package already exists: ${destination}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Plugin package already exists:")) {
      throw error;
    }
  }

  const displayName = toDisplayName(options.name);
  const tokens = {
    PLUGIN_DESCRIPTION: `A Better Auth ${displayName} plugin from Homestead.`,
    PLUGIN_DISPLAY_NAME: displayName,
    PLUGIN_FUNCTION_NAME: toFunctionName(options.name),
    PLUGIN_NAME: options.name,
    PLUGIN_PACKAGE_NAME: `@homestead-systems/ba-${options.name}`,
  } as const;
  const templateFiles = await listTemplateFiles(templateDir);
  const renderedFiles = await Promise.all(
    templateFiles.map(async (templatePath) => ({
      content: renderTemplate(await readFile(join(templateDir, templatePath), "utf8"), tokens),
      outputPath: templatePath.endsWith(".tpl") ? templatePath.slice(0, -4) : templatePath,
    })),
  );

  try {
    await Promise.all(
      renderedFiles.map(async (file) => {
        const outputFile = join(destination, file.outputPath);
        await mkdir(dirname(outputFile), { recursive: true });
        await writeFile(outputFile, file.content, { encoding: "utf8", flag: "wx" });
      }),
    );
  } catch (error) {
    if (basename(destination) === options.name && destination.startsWith(`${packagesDir}${sep}`)) {
      await rm(destination, { force: true, recursive: true });
    }
    throw error;
  }

  return {
    destination,
    files: renderedFiles.map((file) => file.outputPath),
  };
}

if (import.meta.main) {
  const name = Bun.argv[2] ?? "";
  const result = await createPlugin({ name });
  console.log(`Created ${result.destination}`);
}
