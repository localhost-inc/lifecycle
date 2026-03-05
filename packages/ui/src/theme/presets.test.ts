import { describe, expect, test } from "bun:test";
import {
  isThemeAppearance,
  isThemePreset,
  themeAppearanceOptions,
  themePresetOptions,
} from "./presets";

describe("theme presets", () => {
  test("contains base appearance options", () => {
    expect(themeAppearanceOptions.map((option) => option.value)).toEqual([
      "system",
      "light",
      "dark",
    ]);
  });

  test("contains default preset options", () => {
    expect(themePresetOptions.map((option) => option.value)).toEqual([
      "lifecycle",
      "nord",
      "monokai",
    ]);
  });

  test("validates appearance values", () => {
    expect(isThemeAppearance("light")).toBeTrue();
    expect(isThemeAppearance("dark")).toBeTrue();
    expect(isThemeAppearance("system")).toBeTrue();
    expect(isThemeAppearance("unknown")).toBeFalse();
  });

  test("validates preset values", () => {
    expect(isThemePreset("lifecycle")).toBeTrue();
    expect(isThemePreset("nord")).toBeTrue();
    expect(isThemePreset("monokai")).toBeTrue();
    expect(isThemePreset("dracula")).toBeFalse();
  });
});
