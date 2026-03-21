import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { ProjectRecord } from "@lifecycle/contracts";

const project: ProjectRecord = {
  id: "project_1",
  path: "/tmp/project_1",
  name: "Project 1",
  manifestPath: "/tmp/project_1/lifecycle.json",
  manifestValid: true,
  createdAt: "2026-03-20T00:00:00.000Z",
  updatedAt: "2026-03-20T00:00:00.000Z",
};

const backend = {
  listProjects: mock(async () => [project]),
  readManifestText: mock(
    async (): Promise<string | null> =>
      `{"workspace":{"prepare":[{"name":"install","command":"bun install","timeout_seconds":300}]},"environment":{"api":{"kind":"service","runtime":"process","command":"bun run dev"}}}`,
  ),
};

const getBackend = mock(() => backend);

mock.module("../../../lib/backend", () => ({
  getBackend,
}));

const { listProjects, readManifest } = await import("./projects");

describe("projects api", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    getBackend.mockClear();
    backend.listProjects.mockClear();
    backend.readManifestText.mockClear();
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes project list reads through the backend", async () => {
    expect(await listProjects()).toEqual([project]);
    expect(getBackend).toHaveBeenCalledTimes(1);
    expect(backend.listProjects).toHaveBeenCalledTimes(1);
  });

  test("routes manifest reads through the backend before parsing", async () => {
    const result = await readManifest("/tmp/project_1");

    expect(result.state).toBe("valid");
    expect(getBackend).toHaveBeenCalledTimes(1);
    expect(backend.readManifestText).toHaveBeenCalledWith("/tmp/project_1");
  });

  test("treats missing backend manifest text as a missing manifest", async () => {
    backend.readManifestText.mockResolvedValueOnce(null);

    await expect(readManifest("/tmp/project_1")).resolves.toEqual({ state: "missing" });
  });
});
