import { describe, expect, test } from "bun:test";
import {
  applyThemeToRoot,
  DEFAULT_THEME_PREFERENCE,
  readStoredThemePreference,
  resolveTheme,
} from "./theme-provider";

describe("readStoredThemePreference", () => {
  test("falls back to the default preference when storage contains invalid data", () => {
    const storage = {
      getItem: () => '{"theme":"broken"}',
      setItem: () => {},
    };

    expect(readStoredThemePreference("theme", DEFAULT_THEME_PREFERENCE, storage)).toEqual(
      DEFAULT_THEME_PREFERENCE,
    );
  });

  test("returns the stored preference when the theme value is valid", () => {
    const storage = {
      getItem: () => '{"theme":"nord"}',
      setItem: () => {},
    };

    expect(readStoredThemePreference("theme", DEFAULT_THEME_PREFERENCE, storage)).toEqual({
      theme: "nord",
    });
  });
});

describe("resolveTheme", () => {
  test("uses the system appearance when the theme is system", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
  });

  test("returns the theme directly when not system", () => {
    expect(resolveTheme("nord", "light")).toBe("nord");
    expect(resolveTheme("light", "dark")).toBe("light");
  });
});

describe("applyThemeToRoot", () => {
  test("sets data-theme, colorScheme, and dark class on the root element", () => {
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

    applyThemeToRoot("nord", root);

    expect(root.dataset.theme).toBe("nord");
    expect(root.style.colorScheme).toBe("dark");
    expect(added).toContain("dark");
    expect(removed).toHaveLength(0);
  });

  test("removes dark class for light themes", () => {
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

    applyThemeToRoot("light", root);

    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");
    expect(added).toHaveLength(0);
    expect(removed).toContain("dark");
  });
});
