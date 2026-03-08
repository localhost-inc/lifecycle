import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  isThemeAppearance,
  isThemePreset,
  type ThemeAppearance,
  type ThemePreset,
  type ThemeResolvedAppearance,
} from "./presets";

export interface ThemePreference {
  appearance: ThemeAppearance;
  preset: ThemePreset;
}

export interface ThemeProviderProps {
  children: ReactNode;
  defaultPreference?: ThemePreference;
  storageKey: string;
}

export interface ThemeContextValue extends ThemePreference {
  resolvedAppearance: ThemeResolvedAppearance;
  setAppearance: (appearance: ThemeAppearance) => void;
  setPreset: (preset: ThemePreset) => void;
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
  appearance: "dark",
  preset: "lifecycle",
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
    const parsed = JSON.parse(raw) as Partial<ThemePreference>;
    return {
      appearance: isThemeAppearance(parsed.appearance)
        ? parsed.appearance
        : defaultPreference.appearance,
      preset: isThemePreset(parsed.preset) ? parsed.preset : defaultPreference.preset,
    };
  } catch {
    return defaultPreference;
  }
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
): ThemeResolvedAppearance {
  if (!mediaQuery) {
    return "light";
  }

  return mediaQuery.matches ? "dark" : "light";
}

export function resolveThemeAppearance(
  preference: ThemePreference,
  systemAppearance: ThemeResolvedAppearance,
): ThemeResolvedAppearance {
  return preference.appearance === "system" ? systemAppearance : preference.appearance;
}

export function applyThemeToRoot(
  preference: ThemePreference,
  resolvedAppearance: ThemeResolvedAppearance,
  root: ThemeRootLike | null = getThemeRoot(),
): void {
  if (!root) {
    return;
  }

  root.dataset.themePreset = preference.preset;
  root.dataset.themeAppearance = resolvedAppearance;
  root.dataset.themeMode = preference.appearance;
  root.style.colorScheme = resolvedAppearance;

  if (resolvedAppearance === "dark") {
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
  const [systemAppearance, setSystemAppearance] = useState<ThemeResolvedAppearance>(() =>
    getSystemThemeAppearance(),
  );

  const resolvedAppearance = resolveThemeAppearance(preference, systemAppearance);

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
    applyThemeToRoot(preference, resolvedAppearance);

    const storage = getThemeStorage();
    storage?.setItem(storageKey, JSON.stringify(preference));
  }, [preference, resolvedAppearance, storageKey]);

  const setAppearance = useCallback((appearance: ThemeAppearance) => {
    setPreference((prev) => ({ ...prev, appearance }));
  }, []);

  const setPreset = useCallback((preset: ThemePreset) => {
    setPreference((prev) => ({ ...prev, preset }));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      appearance: preference.appearance,
      preset: preference.preset,
      resolvedAppearance,
      setAppearance,
      setPreset,
    }),
    [preference.appearance, preference.preset, resolvedAppearance, setAppearance, setPreset],
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
