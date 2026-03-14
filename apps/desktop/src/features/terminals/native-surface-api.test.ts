import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const invokeTauri = mock(async () => undefined);

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

const { hideNativeTerminalSurface, syncNativeTerminalSurface } =
  await import("./native-surface-api");

describe("native terminal surface api", () => {
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

  test("routes native surface sync through the desktop shell bridge", async () => {
    await syncNativeTerminalSurface({
      appearance: "dark",
      focused: true,
      fontFamily: "Berkeley Mono",
      fontSize: 13,
      height: 720,
      pointerPassthrough: false,
      scaleFactor: 2,
      terminalId: "term_1",
      theme: {
        background: "#000000",
        cursorColor: "#ffffff",
        foreground: "#ffffff",
        palette: ["#000000"],
        selectionBackground: "#222222",
        selectionForeground: "#ffffff",
      },
      visible: true,
      width: 1280,
      x: 10,
      y: 20,
    });
    await hideNativeTerminalSurface("term_1");

    expect(invokeTauri).toHaveBeenNthCalledWith(1, "sync_native_terminal_surface", {
      input: {
        appearance: "dark",
        focused: true,
        fontFamily: "Berkeley Mono",
        fontSize: 13,
        height: 720,
        pointerPassthrough: false,
        scaleFactor: 2,
        terminalId: "term_1",
        theme: {
          background: "#000000",
          cursorColor: "#ffffff",
          foreground: "#ffffff",
          palette: ["#000000"],
          selectionBackground: "#222222",
          selectionForeground: "#ffffff",
        },
        visible: true,
        width: 1280,
        x: 10,
        y: 20,
      },
    });
    expect(invokeTauri).toHaveBeenNthCalledWith(2, "hide_native_terminal_surface", {
      terminalId: "term_1",
    });
  });
});
