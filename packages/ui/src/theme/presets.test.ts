import { describe, expect, test } from "bun:test";
import { isTheme, themeAppearance, themeOptions } from "./presets";

describe("theme presets", () => {
  test("contains all theme options", () => {
    expect(themeOptions.map((option) => option.value)).toEqual([
      "system",
      "light",
      "dark",
      "nord-light",
      "nord-dark",
      "monokai-light",
      "monokai-dark",
    ]);
  });

  test("validates theme values", () => {
    expect(isTheme("system")).toBeTrue();
    expect(isTheme("light")).toBeTrue();
    expect(isTheme("dark")).toBeTrue();
    expect(isTheme("nord-light")).toBeTrue();
    expect(isTheme("nord-dark")).toBeTrue();
    expect(isTheme("monokai-light")).toBeTrue();
    expect(isTheme("monokai-dark")).toBeTrue();
    expect(isTheme("unknown")).toBeFalse();
    expect(isTheme("lifecycle")).toBeFalse();
    expect(isTheme(42)).toBeFalse();
  });

  test("derives appearance from resolved theme", () => {
    expect(themeAppearance("light")).toBe("light");
    expect(themeAppearance("dark")).toBe("dark");
    expect(themeAppearance("nord-light")).toBe("light");
    expect(themeAppearance("nord-dark")).toBe("dark");
    expect(themeAppearance("monokai-light")).toBe("light");
    expect(themeAppearance("monokai-dark")).toBe("dark");
  });
});
