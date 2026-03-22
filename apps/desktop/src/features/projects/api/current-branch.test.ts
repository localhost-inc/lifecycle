import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import { getCurrentBranch } from "./current-branch";

const runtime = {
  getCurrentBranch: mock(async () => "feature/provider-boundary"),
} as unknown as WorkspaceRuntime;

describe("project current branch api", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    (runtime.getCurrentBranch as ReturnType<typeof mock>).mockClear();
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes branch lookup through the runtime", async () => {
    expect(await getCurrentBranch(runtime, "/tmp/project_1")).toBe("feature/provider-boundary");
    expect((runtime.getCurrentBranch as ReturnType<typeof mock>)).toHaveBeenCalledWith("/tmp/project_1");
  });
});
