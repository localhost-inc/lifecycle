import { describe, expect, test } from "bun:test";
import { readManifestFromPath } from "./manifest";

const VALID_MANIFEST = JSON.stringify({
  workspace: {
    setup: [{ name: "install", command: "bun install", timeout_seconds: 120 }],
  },
  environment: {
    api: {
      kind: "service",
      runtime: "process",
      command: "bun run dev",
    },
  },
});

describe("readManifestFromPath", () => {
  test("returns missing when lifecycle.json does not exist", async () => {
    const status = await readManifestFromPath("/repo", {
      exists: async () => false,
      readTextFile: async () => VALID_MANIFEST,
    });

    expect(status).toEqual({ state: "missing" });
  });

  test("returns invalid when file exists but cannot be read", async () => {
    const status = await readManifestFromPath("/repo", {
      exists: async () => true,
      readTextFile: async () => {
        throw new Error("permission denied");
      },
    });

    expect(status.state).toBe("invalid");
    if (status.state !== "invalid") {
      return;
    }

    expect(status.result.errors[0]?.message).toContain("Failed to read lifecycle.json");
    expect(status.result.errors[0]?.message).toContain("permission denied");
  });

  test("returns valid when manifest parses successfully", async () => {
    const status = await readManifestFromPath("/repo", {
      exists: async () => true,
      readTextFile: async () => VALID_MANIFEST,
    });

    expect(status.state).toBe("valid");
  });

  test("returns invalid when manifest is malformed", async () => {
    const status = await readManifestFromPath("/repo", {
      exists: async () => true,
      readTextFile: async () => "{ invalid jsonc",
    });

    expect(status.state).toBe("invalid");
  });
});
