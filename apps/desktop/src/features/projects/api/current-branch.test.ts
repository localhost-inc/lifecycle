import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const invokeTauri = mock(async () => "feature/provider-boundary");

mock.module("../../../lib/tauri-error", () => ({
  invokeTauri,
  toErrorEnvelope(error: unknown) {
    if (error !== null && typeof error === "object") {
      const value = error as Record<string, unknown>;
      return {
        code: typeof value.code === "string" ? value.code : "internal_error",
        details:
          value.details !== null && typeof value.details === "object"
            ? (value.details as Record<string, unknown>)
            : undefined,
        message:
          typeof value.message === "string" ? value.message : "Unexpected desktop runtime error.",
        requestId: typeof value.requestId === "string" ? value.requestId : "test-request",
        retryable: typeof value.retryable === "boolean" ? value.retryable : false,
        suggestedAction:
          typeof value.suggestedAction === "string" ? value.suggestedAction : undefined,
      };
    }

    return {
      code: "internal_error",
      message: error instanceof Error ? error.message : String(error),
      requestId: "test-request",
      retryable: false,
    };
  },
}));

const { getCurrentBranch } = await import("./current-branch");

describe("project current branch api", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "isTauri", {
      configurable: true,
      value: true,
      writable: true,
    });
    invokeTauri.mockClear();
  });

  afterEach(() => {
    delete (globalThis as typeof globalThis & { isTauri?: boolean }).isTauri;
  });

  test("routes branch lookup through the project control-plane query", async () => {
    expect(await getCurrentBranch("/tmp/project_1")).toBe("feature/provider-boundary");
    expect(invokeTauri).toHaveBeenCalledWith("get_current_branch", {
      projectPath: "/tmp/project_1",
    });
  });
});
