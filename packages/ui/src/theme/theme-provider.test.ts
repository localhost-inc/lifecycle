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
      getItem: () => '{"theme":"nord-dark"}',
      setItem: () => {},
    };

    expect(readStoredThemePreference("theme", DEFAULT_THEME_PREFERENCE, storage)).toEqual({
      theme: "nord-dark",
    });
  });

  test("migrates old preset+appearance format to new theme format", () => {
    const stored: Record<string, string> = {};
    const storage = {
      getItem: () => '{"preset":"nord","appearance":"dark"}',
      setItem: (key: string, value: string) => {
        stored[key] = value;
      },
    };

    expect(readStoredThemePreference("theme", DEFAULT_THEME_PREFERENCE, storage)).toEqual({
      theme: "nord-dark",
    });
    expect(stored.theme).toBe('{"theme":"nord-dark"}');
  });

  test("migrates old lifecycle+system format to system theme", () => {
    const stored: Record<string, string> = {};
    const storage = {
      getItem: () => '{"preset":"lifecycle","appearance":"system"}',
      setItem: (key: string, value: string) => {
        stored[key] = value;
      },
    };

    expect(readStoredThemePreference("theme", DEFAULT_THEME_PREFERENCE, storage)).toEqual({
      theme: "system",
    });
    expect(stored.theme).toBe('{"theme":"system"}');
  });

  test("migrates old lifecycle+light format to light theme", () => {
    const storage = {
      getItem: () => '{"preset":"lifecycle","appearance":"light"}',
      setItem: () => {},
    };

    expect(readStoredThemePreference("theme", DEFAULT_THEME_PREFERENCE, storage)).toEqual({
      theme: "light",
    });
  });
});

describe("resolveTheme", () => {
  test("uses the system appearance when the theme is system", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
  });

  test("returns the theme directly when not system", () => {
    expect(resolveTheme("nord-dark", "light")).toBe("nord-dark");
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

    applyThemeToRoot("nord-dark", root);

    expect(root.dataset.theme).toBe("nord-dark");
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

    applyThemeToRoot("monokai-light", root);

    expect(root.dataset.theme).toBe("monokai-light");
    expect(root.style.colorScheme).toBe("light");
    expect(added).toHaveLength(0);
    expect(removed).toContain("dark");
  });
});
