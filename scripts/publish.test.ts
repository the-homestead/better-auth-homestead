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
    const commands: string[][] = [];

    await manualPublish({
      getBranch: async () => "main",
      getStatus: async () => "",
      run: async (command) => {
        commands.push(command);
      },
    });

    expect(commands).toEqual([
      ["bun", "run", "validate"],
      ["bun", "pm", "whoami"],
      ["bunx", "changeset", "publish"],
    ]);
  });
});
