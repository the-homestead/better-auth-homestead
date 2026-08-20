export interface ReleaseState {
  branch: string;
  status: string;
}

export interface PublishRunOptions {
  env?: Record<string, string>;
}

export interface PublishAdapters {
  getBranch: () => Promise<string>;
  getStatus: () => Promise<string>;
  run: (command: string[], options?: PublishRunOptions) => Promise<void>;
}

export function assertReleaseReady(state: ReleaseState): void {
  if (state.branch.trim() !== "main") {
    throw new Error("Manual publishing is allowed only from the main branch.");
  }
  if (state.status.trim() !== "") {
    throw new Error("Manual publishing requires a clean working tree.");
  }
}

export async function manualPublish(adapters: PublishAdapters): Promise<void> {
  assertReleaseReady({
    branch: await adapters.getBranch(),
    status: await adapters.getStatus(),
  });

  await adapters.run(["bun", "run", "validate"]);
  await adapters.run(["bun", "pm", "whoami"]);
  await adapters.run(["bunx", "changeset", "publish"], {
    env: { NPM_CONFIG_PROVENANCE: "false" },
  });
}

async function output(command: string[]): Promise<string> {
  const process = Bun.spawn(command, { stderr: "inherit", stdout: "pipe" });
  const text = await new Response(process.stdout).text();
  const exitCode = await process.exited;
  if (exitCode !== 0) throw new Error(`Command failed: ${command.join(" ")}`);
  return text.trim();
}

async function run(command: string[], options?: PublishRunOptions): Promise<void> {
  const process = Bun.spawn(command, {
    env: options?.env ? { ...globalThis.process.env, ...options.env } : undefined,
    stderr: "inherit",
    stdout: "inherit",
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) throw new Error(`Command failed: ${command.join(" ")}`);
}

if (import.meta.main) {
  await manualPublish({
    getBranch: () => output(["git", "branch", "--show-current"]),
    getStatus: () => output(["git", "status", "--porcelain"]),
    run,
  });
}
