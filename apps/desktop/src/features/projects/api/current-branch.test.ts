import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const backend = {
  getCurrentBranch: mock(async () => "feature/provider-boundary"),
};

const getBackend = mock(() => backend);

mock.module("../../../lib/backend", () => ({
  getBackend,
}));

const { getCurrentBranch } = await import("./current-branch");

describe("project current branch api", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    getBackend.mockClear();
    backend.getCurrentBranch.mockClear();
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes branch lookup through the backend", async () => {
    expect(await getCurrentBranch("/tmp/project_1")).toBe("feature/provider-boundary");
    expect(getBackend).toHaveBeenCalledTimes(1);
    expect(backend.getCurrentBranch).toHaveBeenCalledWith("/tmp/project_1");
  });
});
