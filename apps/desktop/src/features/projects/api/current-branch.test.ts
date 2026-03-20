import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const controlPlane = {
  getCurrentBranch: mock(async () => "feature/provider-boundary"),
};

const getControlPlane = mock(() => controlPlane);

mock.module("../../../lib/control-plane", () => ({
  getControlPlane,
}));

const { getCurrentBranch } = await import("./current-branch");

describe("project current branch api", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    getControlPlane.mockClear();
    controlPlane.getCurrentBranch.mockClear();
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes branch lookup through the project control plane", async () => {
    expect(await getCurrentBranch("/tmp/project_1")).toBe("feature/provider-boundary");
    expect(getControlPlane).toHaveBeenCalledTimes(1);
    expect(controlPlane.getCurrentBranch).toHaveBeenCalledWith("/tmp/project_1");
  });
});
