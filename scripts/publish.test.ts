import { describe, expect, test } from "bun:test";

import { assertReleaseReady, manualPublish } from "./publish.ts";

describe("assertReleaseReady", () => {
  test("requires the main branch", () => {
    expect(() => assertReleaseReady({ branch: "feature/release", status: "" })).toThrow(
      "main branch",
    );
  });

  test("requires a clean working tree", () => {
    expect(() => assertReleaseReady({ branch: "main", status: " M package.json" })).toThrow(
      "working tree",
    );
  });
});

describe("manualPublish", () => {
  test("validates before publishing", async () => {
    const commands: Array<{ command: string[]; env?: Record<string, string> }> = [];

    await manualPublish({
      getBranch: async () => "main",
      getStatus: async () => "",
      run: async (command, options) => {
        commands.push({ command, env: options?.env });
      },
    });

    expect(commands).toEqual([
      { command: ["bun", "run", "validate"] },
      { command: ["bun", "pm", "whoami"] },
      {
        command: ["bunx", "changeset", "publish"],
        env: { NPM_CONFIG_PROVENANCE: "false" },
      },
    ]);
  });
});
