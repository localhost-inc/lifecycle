import { describe, expect, test } from "bun:test";
import { buildTerminalRuntimeDiagnostics, isBenignTerminalIoError } from "./terminal-panel";

describe("isBenignTerminalIoError", () => {
  test("suppresses closed-pty noise", () => {
    expect(
      isBenignTerminalIoError("Terminal attach failed: terminal session is unavailable"),
    ).toBeTrue();
    expect(isBenignTerminalIoError("IO error: No such process (os error 3)")).toBeTrue();
    expect(isBenignTerminalIoError("Broken pipe")).toBeTrue();
    expect(isBenignTerminalIoError("bad file descriptor")).toBeTrue();
  });

  test("keeps actionable terminal errors visible", () => {
    expect(isBenignTerminalIoError("Terminal attach failed: permission denied")).toBeFalse();
    expect(isBenignTerminalIoError("unexpected terminal error")).toBeFalse();
  });
});

describe("buildTerminalRuntimeDiagnostics", () => {
  test("maps the platform hint into the shared diagnostics shape", () => {
    expect(
      buildTerminalRuntimeDiagnostics({
        activeRenderer: "dom",
        allowTransparency: false,
        bundledFontReady: true,
        configuredFontFamily: '"Lifecycle Mono", Menlo, monospace',
        devicePixelRatio: 2,
        platformHint: "macOS",
        requestedRenderer: "system",
        resolvedRenderer: "dom",
        webglStatus: "not-requested",
      }),
    ).toEqual({
      activeRenderer: "dom",
      allowTransparency: false,
      bundledFontReady: true,
      configuredFontFamily: '"Lifecycle Mono", Menlo, monospace',
      devicePixelRatio: 2,
      platform: "macos",
      requestedRenderer: "system",
      resolvedRenderer: "dom",
      webglStatus: "not-requested",
    });
  });
});
