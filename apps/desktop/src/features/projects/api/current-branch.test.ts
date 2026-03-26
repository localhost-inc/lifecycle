import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as tauriError from "@/lib/tauri-error";
import { getCurrentBranch } from "./current-branch";

const invokeTauriMock = mock(async () => "feature/provider-boundary");

describe("project current branch api", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    invokeTauriMock.mockClear();
    mock.module("@/lib/tauri-error", () => ({
      ...tauriError,
      invokeTauri: invokeTauriMock,
    }));
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes branch lookup through the runtime", async () => {
    expect(await getCurrentBranch("/tmp/project_1")).toBe("feature/provider-boundary");
    expect(invokeTauriMock).toHaveBeenCalledWith("get_current_branch", {
      projectPath: "/tmp/project_1",
    });
  });
});
