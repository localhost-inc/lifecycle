import { describe, expect, test } from "bun:test";
import {
  applyTerminalAppearance,
  buildTerminalAttachmentWritePayloads,
  buildTerminalRuntimeDiagnostics,
  formatTerminalAttachmentInsertion,
  isBenignTerminalIoError,
  isImageAttachmentFile,
} from "./terminal-surface";

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

describe("applyTerminalAppearance", () => {
  test("updates an existing terminal in place for theme changes", () => {
    const properties = new Map<string, string>();
    const host = {
      dataset: {},
      style: {
        backgroundColor: "",
        setProperty(name: string, value: string) {
          properties.set(name, value);
        },
      },
    };
    const theme = {
      background: "#101418",
      cursor: "#59c1ff",
      foreground: "#f7fbff",
    };
    const xterm = {
      options: {
        theme: undefined as typeof theme | undefined,
      },
    };

    const background = applyTerminalAppearance({
      host,
      theme,
      xterm,
    });

    expect(background).toBe("#101418");
    expect(host.style.backgroundColor).toBe("#101418");
    expect(properties.get("--terminal-surface-background")).toBe("#101418");
    expect(xterm.options.theme).toEqual(theme);
  });
});

describe("terminal attachments", () => {
  test("recognizes image attachments by MIME type and extension", () => {
    expect(isImageAttachmentFile({ name: "clipboard", type: "image/png" } as File)).toBeTrue();
    expect(isImageAttachmentFile({ name: "diagram.webp", type: "" } as File)).toBeTrue();
    expect(isImageAttachmentFile({ name: "notes.txt", type: "text/plain" } as File)).toBeFalse();
  });

  test("formats saved attachment paths for insertion into the terminal prompt", () => {
    expect(formatTerminalAttachmentInsertion(["/tmp/one.png", "/tmp/two with spaces.png"])).toBe(
      '"/tmp/one.png" "/tmp/two with spaces.png"',
    );
  });

  test("uses plain terminal text for non-Codex harnesses", () => {
    expect(
      buildTerminalAttachmentWritePayloads("claude", ["/tmp/one.png", "/tmp/two with spaces.png"]),
    ).toEqual(['"/tmp/one.png" "/tmp/two with spaces.png" ']);
  });

  test("uses bracketed paste payloads for Codex image attachments", () => {
    expect(
      buildTerminalAttachmentWritePayloads("codex", ["/tmp/one.png", "/tmp/two with spaces.png"]),
    ).toEqual([
      '\u001b[200~"/tmp/one.png"\u001b[201~',
      '\u001b[200~"/tmp/two with spaces.png"\u001b[201~',
    ]);
  });
});
