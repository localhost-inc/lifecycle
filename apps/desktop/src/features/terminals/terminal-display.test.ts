import { describe, expect, test } from "bun:test";

import {
  DEFAULT_TERMINAL_RENDERER,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  LIFECYCLE_MONO_FONT_FAMILY,
  getDefaultTerminalFontFamily,
  getPrimaryTerminalFontFamily,
  getTerminalFontPresets,
  normalizeTerminalFontFamily,
  normalizeTerminalFontSize,
  normalizeTerminalLineHeight,
  normalizeTerminalRenderer,
  resolveTerminalRenderer,
  shouldAllowTerminalTransparency,
} from "./terminal-display";

describe("terminal display defaults", () => {
  test("prefers the platform terminal stack on macOS", () => {
    const family = getDefaultTerminalFontFamily("macOS");

    expect(family.startsWith('"SF Mono"')).toBeTrue();
    expect(family).toContain(`"${LIFECYCLE_MONO_FONT_FAMILY}"`);
    expect(family).toContain('"Symbols Nerd Font Mono"');
  });

  test("keeps platform fallbacks on Windows", () => {
    const family = getDefaultTerminalFontFamily("Windows");

    expect(family).toContain("Consolas");
    expect(family).toContain('"Segoe UI Symbol"');
  });

  test("offers the system preset first", () => {
    const presets = getTerminalFontPresets("macOS");
    expect(presets[0]?.id).toBe("system-mono");
    expect(presets[1]?.id).toBe("lifecycle-mono");
    expect(presets[1]?.fontFamily).toBe(getDefaultTerminalFontFamily("macOS"));
  });
});

describe("terminal display normalization", () => {
  test("falls back to the default font family when empty", () => {
    expect(normalizeTerminalFontFamily("   ")).toBe(getDefaultTerminalFontFamily());
  });

  test("clamps terminal font size into a safe range", () => {
    expect(normalizeTerminalFontSize("9")).toBe(11);
    expect(normalizeTerminalFontSize("24")).toBe(20);
    expect(normalizeTerminalFontSize("")).toBe(DEFAULT_TERMINAL_FONT_SIZE);
  });

  test("clamps terminal line height into a safe range", () => {
    expect(normalizeTerminalLineHeight("0.5")).toBe(1);
    expect(normalizeTerminalLineHeight("2")).toBe(1.6);
    expect(normalizeTerminalLineHeight("")).toBe(DEFAULT_TERMINAL_LINE_HEIGHT);
  });

  test("normalizes terminal renderer values", () => {
    expect(normalizeTerminalRenderer("dom")).toBe("dom");
    expect(normalizeTerminalRenderer("bogus")).toBe(DEFAULT_TERMINAL_RENDERER);
  });

  test("resolves the system renderer to DOM on macOS", () => {
    expect(resolveTerminalRenderer("system", "macOS")).toBe("dom");
  });

  test("resolves the system renderer to WebGL off macOS", () => {
    expect(resolveTerminalRenderer("system", "Windows")).toBe("webgl");
  });
});

describe("terminal display helpers", () => {
  test("extracts the primary font family from a CSS stack", () => {
    expect(getPrimaryTerminalFontFamily('"Lifecycle Mono", Menlo, monospace')).toBe(
      "Lifecycle Mono",
    );
  });

  test("only enables transparency for translucent colors", () => {
    expect(shouldAllowTerminalTransparency("#09090b")).toBeFalse();
    expect(shouldAllowTerminalTransparency("rgba(9, 9, 11, 0.5)")).toBeTrue();
  });
});
