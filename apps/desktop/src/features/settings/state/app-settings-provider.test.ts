import { describe, expect, test } from "bun:test";

import { applyFontSettings } from "./app-settings-provider";

describe("applyFontSettings", () => {
  test("writes interface and monospace font tokens to the root style", () => {
    const properties = new Map<string, string>();
    const root = {
      setProperty(name: string, value: string) {
        properties.set(name, value);
      },
    };

    applyFontSettings(
      {
        interfaceFontFamily: '"Geist", system-ui, sans-serif',
        monospaceFontFamily: '"Geist Mono", ui-monospace, monospace',
      },
      root,
    );

    expect(properties.get("--font-heading")).toBe('"Geist", system-ui, sans-serif');
    expect(properties.get("--font-body")).toBe('"Geist", system-ui, sans-serif');
    expect(properties.get("--font-mono")).toBe('"Geist Mono", ui-monospace, monospace');
  });
});
