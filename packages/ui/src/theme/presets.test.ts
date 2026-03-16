import { describe, expect, test } from "bun:test";
import {
  diffTheme,
  isTheme,
  LIFECYCLE_DARK_DIFF_THEME,
  LIFECYCLE_LIGHT_DIFF_THEME,
  themeAppearance,
  themeOptions,
} from "./presets";

describe("theme presets", () => {
  test("contains all theme options", () => {
    expect(themeOptions.map((option) => option.value)).toEqual([
      "system",
      "light",
      "dark",
      "github-light",
      "github-dark",
      "nord",
      "monokai",
      "catppuccin",
      "dracula",
      "rose-pine",
    ]);
  });

  test("validates theme values", () => {
    expect(isTheme("system")).toBeTrue();
    expect(isTheme("light")).toBeTrue();
    expect(isTheme("dark")).toBeTrue();
    expect(isTheme("github-light")).toBeTrue();
    expect(isTheme("github-dark")).toBeTrue();
    expect(isTheme("nord")).toBeTrue();
    expect(isTheme("monokai")).toBeTrue();
    expect(isTheme("catppuccin")).toBeTrue();
    expect(isTheme("dracula")).toBeTrue();
    expect(isTheme("rose-pine")).toBeTrue();
    expect(isTheme("nord-light")).toBeFalse();
    expect(isTheme("nord-dark")).toBeFalse();
    expect(isTheme("monokai-light")).toBeFalse();
    expect(isTheme("monokai-dark")).toBeFalse();
    expect(isTheme("unknown")).toBeFalse();
    expect(isTheme("lifecycle")).toBeFalse();
    expect(isTheme(42)).toBeFalse();
  });

  test("derives appearance from resolved theme", () => {
    expect(themeAppearance("light")).toBe("light");
    expect(themeAppearance("dark")).toBe("dark");
    expect(themeAppearance("github-light")).toBe("light");
    expect(themeAppearance("github-dark")).toBe("dark");
    expect(themeAppearance("nord")).toBe("dark");
    expect(themeAppearance("monokai")).toBe("dark");
    expect(themeAppearance("catppuccin")).toBe("dark");
    expect(themeAppearance("dracula")).toBe("dark");
    expect(themeAppearance("rose-pine")).toBe("dark");
  });

  test("maps themes to shiki theme names", () => {
    expect(diffTheme("light")).toBe(LIFECYCLE_LIGHT_DIFF_THEME);
    expect(diffTheme("dark")).toBe(LIFECYCLE_DARK_DIFF_THEME);
    expect(diffTheme("github-light")).toBe("github-light-default");
    expect(diffTheme("github-dark")).toBe("github-dark-default");
    expect(diffTheme("nord")).toBe("nord");
    expect(diffTheme("monokai")).toBe("monokai");
    expect(diffTheme("catppuccin")).toBe("catppuccin-mocha");
    expect(diffTheme("dracula")).toBe("dracula");
    expect(diffTheme("rose-pine")).toBe("rose-pine");
  });
});
