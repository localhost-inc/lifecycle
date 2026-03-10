import { describe, expect, test } from "bun:test";

import {
  DEFAULT_INTERFACE_FONT_FAMILY,
  DEFAULT_MONOSPACE_FONT_FAMILY,
  getInterfaceFontPresets,
  getMonospaceFontPresets,
  getNativeMonospaceFontFamily,
  getPrimaryFontFamily,
  normalizeFontFamily,
} from "./typography";

describe("typography", () => {
  test("keeps Geist defaults for interface and monospace fonts", () => {
    expect(DEFAULT_INTERFACE_FONT_FAMILY).toContain('"Geist"');
    expect(DEFAULT_MONOSPACE_FONT_FAMILY).toContain('"Geist Mono"');
  });

  test("falls back when the configured font family is blank", () => {
    expect(normalizeFontFamily("   ", DEFAULT_INTERFACE_FONT_FAMILY)).toBe(
      DEFAULT_INTERFACE_FONT_FAMILY,
    );
  });

  test("extracts the primary font family from a CSS stack", () => {
    expect(getPrimaryFontFamily('"Geist Mono", "JetBrains Mono", monospace')).toBe("Geist Mono");
  });

  test("offers interface and monospace presets with Geist first", () => {
    expect(getInterfaceFontPresets()[0]?.id).toBe("geist");
    expect(getMonospaceFontPresets("macos")[0]?.id).toBe("geist-mono");
  });

  test("maps generic monospace stacks to a concrete native font family", () => {
    expect(getNativeMonospaceFontFamily("ui-monospace, monospace", "macos")).toBe("SF Mono");
    expect(getNativeMonospaceFontFamily(DEFAULT_MONOSPACE_FONT_FAMILY, "macos")).toBe("Geist Mono");
  });
});
