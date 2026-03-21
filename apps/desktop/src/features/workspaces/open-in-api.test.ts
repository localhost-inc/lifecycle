import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const invokeTauri = mock(async (command: string) => {
  switch (command) {
    case "list_workspace_open_in_apps":
      return [
        {
          icon_data_url: null,
          id: "vscode",
          label: "VS Code",
        },
      ];
    case "open_workspace_in_app":
      return undefined;
    default:
      throw new Error(`Unexpected command: ${command}`);
  }
});

mock.module("../../lib/tauri-error", () => ({
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
          typeof value.message === "string" ? value.message : "Unexpected desktop error.",
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

const { listWorkspaceOpenInApps, openWorkspaceInApp } = await import("./open-in-api");

describe("workspace open-in api", () => {
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

  test("routes host app launch helpers through the desktop shell bridge", async () => {
    expect(await listWorkspaceOpenInApps()).toEqual([
      {
        icon_data_url: null,
        id: "vscode",
        label: "VS Code",
      },
    ]);
    await openWorkspaceInApp("ws_1", "vscode");

    expect(invokeTauri).toHaveBeenNthCalledWith(1, "list_workspace_open_in_apps");
    expect(invokeTauri).toHaveBeenNthCalledWith(2, "open_workspace_in_app", {
      appId: "vscode",
      workspaceId: "ws_1",
    });
  });
});
