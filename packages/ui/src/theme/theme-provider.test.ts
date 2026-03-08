import { describe, expect, test } from "bun:test";
import {
  applyThemeToRoot,
  DEFAULT_THEME_PREFERENCE,
  readStoredThemePreference,
  resolveThemeAppearance,
} from "./theme-provider";

describe("readStoredThemePreference", () => {
  test("falls back to the default preference when storage contains invalid data", () => {
    const storage = {
      getItem: () => '{"appearance":"broken","preset":"unknown"}',
      setItem: () => {},
    };

    expect(readStoredThemePreference("theme", DEFAULT_THEME_PREFERENCE, storage)).toEqual(
      DEFAULT_THEME_PREFERENCE,
    );
  });

  test("returns the stored preference when both values are valid", () => {
    const storage = {
      getItem: () => '{"appearance":"system","preset":"nord"}',
      setItem: () => {},
    };

    expect(readStoredThemePreference("theme", DEFAULT_THEME_PREFERENCE, storage)).toEqual({
      appearance: "system",
      preset: "nord",
    });
  });
});

describe("resolveThemeAppearance", () => {
  test("uses the system appearance when the preference is set to system", () => {
    expect(
      resolveThemeAppearance(
        {
          appearance: "system",
          preset: "lifecycle",
        },
        "dark",
      ),
    ).toBe("dark");
  });
});

describe("applyThemeToRoot", () => {
  test("syncs preset, appearance, and dark class state onto the root element", () => {
    const added: string[] = [];
    const removed: string[] = [];
    const root = {
      classList: {
        add: (...tokens: string[]) => {
          added.push(...tokens);
        },
        remove: (...tokens: string[]) => {
          removed.push(...tokens);
        },
      },
      dataset: {} as Record<string, string | undefined>,
      style: {
        colorScheme: "",
      },
    };

    applyThemeToRoot(
      {
        appearance: "system",
        preset: "nord",
      },
      "dark",
      root,
    );

    expect(root.dataset.themePreset).toBe("nord");
    expect(root.dataset.themeAppearance).toBe("dark");
    expect(root.dataset.themeMode).toBe("system");
    expect(root.style.colorScheme).toBe("dark");
    expect(added).toContain("dark");
    expect(removed).toHaveLength(0);
  });
});
