import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isTheme, themeAppearance, type ResolvedTheme, type Theme } from "./presets";

export interface ThemePreference {
  theme: Theme;
}

export interface ThemeProviderProps {
  children: ReactNode;
  defaultPreference?: ThemePreference;
  storageKey: string;
}

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  resolvedAppearance: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

interface ThemeStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface ThemeRootLike {
  classList: {
    add: (...tokens: string[]) => void;
    remove: (...tokens: string[]) => void;
  };
  dataset: Record<string, string | undefined>;
  style: {
    colorScheme: string;
  };
}

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  theme: "dark",
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getThemeStorage(): ThemeStorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function getThemeRoot(): ThemeRootLike | null {
  if (typeof document === "undefined") {
    return null;
  }

  return document.documentElement;
}

export function readStoredThemePreference(
  storageKey: string,
  defaultPreference: ThemePreference = DEFAULT_THEME_PREFERENCE,
  storage: ThemeStorageLike | null = getThemeStorage(),
): ThemePreference {
  if (!storage) {
    return defaultPreference;
  }

  const raw = storage.getItem(storageKey);
  if (!raw) {
    return defaultPreference;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // New format: { theme: "..." }
    if (isTheme(parsed.theme)) {
      return { theme: parsed.theme };
    }

    // Migration from old format: { preset: "...", appearance: "..." }
    if (typeof parsed.preset === "string" && typeof parsed.appearance === "string") {
      const migrated = migrateOldPreference(parsed.preset, parsed.appearance);
      if (migrated) {
        storage.setItem(storageKey, JSON.stringify(migrated));
        return migrated;
      }
    }

    return defaultPreference;
  } catch {
    return defaultPreference;
  }
}

function migrateOldPreference(preset: string, appearance: string): ThemePreference | null {
  if (preset === "lifecycle") {
    if (appearance === "system") return { theme: "system" };
    if (appearance === "light") return { theme: "light" };
    if (appearance === "dark") return { theme: "dark" };
  }

  if (preset === "nord") {
    if (appearance === "system") return { theme: "system" };
    if (appearance === "light") return { theme: "nord-light" };
    if (appearance === "dark") return { theme: "nord-dark" };
  }

  if (preset === "monokai") {
    if (appearance === "system") return { theme: "system" };
    if (appearance === "light") return { theme: "monokai-light" };
    if (appearance === "dark") return { theme: "monokai-dark" };
  }

  return null;
}

export function getSystemThemeAppearance(
  mediaQuery:
    | {
        matches: boolean;
      }
    | null
    | undefined = typeof window === "undefined"
    ? null
    : window.matchMedia("(prefers-color-scheme: dark)"),
): "light" | "dark" {
  if (!mediaQuery) {
    return "light";
  }

  return mediaQuery.matches ? "dark" : "light";
}

export function resolveTheme(
  theme: Theme,
  systemAppearance: "light" | "dark",
): ResolvedTheme {
  return theme === "system" ? systemAppearance : theme;
}

export function applyThemeToRoot(
  resolvedTheme: ResolvedTheme,
  root: ThemeRootLike | null = getThemeRoot(),
): void {
  if (!root) {
    return;
  }

  const appearance = themeAppearance(resolvedTheme);
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = appearance;

  if (appearance === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({
  children,
  defaultPreference = DEFAULT_THEME_PREFERENCE,
  storageKey,
}: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    readStoredThemePreference(storageKey, defaultPreference),
  );
  const [systemAppearance, setSystemAppearance] = useState<"light" | "dark">(() =>
    getSystemThemeAppearance(),
  );

  const resolvedTheme = resolveTheme(preference.theme, systemAppearance);
  const resolvedAppearance = themeAppearance(resolvedTheme);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      setSystemAppearance(media.matches ? "dark" : "light");
    };

    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyThemeToRoot(resolvedTheme);

    const storage = getThemeStorage();
    storage?.setItem(storageKey, JSON.stringify(preference));
  }, [preference, resolvedTheme, storageKey]);

  const setTheme = useCallback((theme: Theme) => {
    setPreference({ theme });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: preference.theme,
      resolvedTheme,
      resolvedAppearance,
      setTheme,
    }),
    [preference.theme, resolvedTheme, resolvedAppearance, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
