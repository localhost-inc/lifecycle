import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ProjectRecord } from "@lifecycle/contracts";
import type { WorkspaceClient } from "@lifecycle/workspace";
import { readManifest } from "./projects";

const client = {
  readManifestText: mock(
    async (): Promise<string | null> =>
      `{"workspace":{"prepare":[{"name":"install","command":"bun install","timeout_seconds":300}]},"environment":{"api":{"kind":"service","runtime":"process","command":"bun run dev"}}}`,
  ),
} as unknown as WorkspaceClient;

describe("projects api", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    (client.readManifestText as ReturnType<typeof mock>).mockClear();
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes manifest reads through the runtime before parsing", async () => {
    const result = await readManifest(client, "/tmp/project_1");

    expect(result.state).toBe("valid");
    expect((client.readManifestText as ReturnType<typeof mock>)).toHaveBeenCalledWith("/tmp/project_1");
  });

  test("treats missing runtime manifest text as a missing manifest", async () => {
    (client.readManifestText as ReturnType<typeof mock>).mockResolvedValueOnce(null);

    await expect(readManifest(client, "/tmp/project_1")).resolves.toEqual({ state: "missing" });
  });
});
