import { describe, expect, test } from "bun:test";

import { defaultTuiTheme, deriveTuiTheme } from "./tui-theme";

describe("tui theme", () => {
  test("derives semantic tokens from terminal defaults and ansi palette", () => {
    const theme = deriveTuiTheme({
      cursorColor: "#ff00ff",
      defaultBackground: "#f8f8f8",
      defaultForeground: "#121212",
      highlightBackground: "#dbeafe",
      highlightForeground: "#111827",
      mouseBackground: "#f8f8f8",
      mouseForeground: "#121212",
      palette: [
        "#000000",
        "#cc0000",
        "#00aa00",
        "#aa7700",
        "#0044cc",
        "#aa00aa",
        "#008888",
        "#dddddd",
        "#666666",
        "#ff4444",
        "#44cc44",
        "#ffcc44",
        "#3388ff",
        "#cc66ff",
        "#33cccc",
        "#ffffff",
      ],
      tekBackground: "#f8f8f8",
      tekForeground: "#121212",
    });

    expect(theme.background).toBe("#f8f8f8");
    expect(theme.foreground).toBe("#121212");
    expect(theme.border.active).toBe("#121212");
    expect(theme.state.danger).toBe("#ff4444");
    expect(theme.state.info).toBe("#3388ff");
    expect(theme.sidebar.selected).toBe(theme.surfaceSelected);
    expect(theme.surfaceSelected).not.toBe(theme.background);
    expect(theme.mutedForeground).not.toBe(theme.foreground);
  });

  test("falls back to the lifecycle dark theme when palette data is missing", () => {
    expect(deriveTuiTheme(null)).toEqual(defaultTuiTheme);
  });
});
