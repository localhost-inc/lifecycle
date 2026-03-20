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

const controlPlane = {
  listProjects: mock(async () => [project]),
  readManifestText: mock(
    async (): Promise<string | null> =>
      `{"workspace":{"prepare":[{"name":"install","command":"bun install","timeout_seconds":300}]},"environment":{"api":{"kind":"service","runtime":"process","command":"bun run dev"}}}`,
  ),
};

const getControlPlane = mock(() => controlPlane);

mock.module("../../../lib/control-plane", () => ({
  getControlPlane,
}));

const { listProjects, readManifest } = await import("./projects");

describe("projects api", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    getControlPlane.mockClear();
    controlPlane.listProjects.mockClear();
    controlPlane.readManifestText.mockClear();
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes project list reads through the control plane", async () => {
    expect(await listProjects()).toEqual([project]);
    expect(getControlPlane).toHaveBeenCalledTimes(1);
    expect(controlPlane.listProjects).toHaveBeenCalledTimes(1);
  });

  test("routes manifest reads through the control plane before parsing", async () => {
    const result = await readManifest("/tmp/project_1");

    expect(result.state).toBe("valid");
    expect(getControlPlane).toHaveBeenCalledTimes(1);
    expect(controlPlane.readManifestText).toHaveBeenCalledWith("/tmp/project_1");
  });

  test("treats missing control-plane manifest text as a missing manifest", async () => {
    controlPlane.readManifestText.mockResolvedValueOnce(null);

    await expect(readManifest("/tmp/project_1")).resolves.toEqual({ state: "missing" });
  });
});
