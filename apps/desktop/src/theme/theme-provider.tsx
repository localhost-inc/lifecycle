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
} from "@lifecycle/ui";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export interface ThemePreference {
  appearance: ThemeAppearance;
  preset: ThemePreset;
}

interface ThemeContextValue extends ThemePreference {
  resolvedAppearance: ThemeResolvedAppearance;
  setAppearance: (appearance: ThemeAppearance) => void;
  setPreset: (preset: ThemePreset) => void;
}

const THEME_STORAGE_KEY = "lifecycle.desktop.theme.v1";

const defaultPreference: ThemePreference = {
  appearance: "dark",
  preset: "lifecycle",
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return defaultPreference;

  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (!raw) return defaultPreference;

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

function getSystemAppearance(): ThemeResolvedAppearance {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyThemeToDom(
  preference: ThemePreference,
  resolvedAppearance: ThemeResolvedAppearance,
): void {
  const root = document.documentElement;
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(() => readStoredPreference());
  const [systemAppearance, setSystemAppearance] = useState<ThemeResolvedAppearance>(() =>
    getSystemAppearance(),
  );

  const resolvedAppearance: ThemeResolvedAppearance =
    preference.appearance === "system" ? systemAppearance : preference.appearance;

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      setSystemAppearance(media.matches ? "dark" : "light");
    };

    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    applyThemeToDom(preference, resolvedAppearance);
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(preference));
  }, [preference, resolvedAppearance]);

  useEffect(() => {
    if (!isTauri()) return;

    // Keep native window chrome aligned with the resolved app appearance.
    void getCurrentWindow()
      .setTheme(resolvedAppearance)
      .catch((error) => {
        console.warn("Failed to sync native window theme:", error);
      });
  }, [resolvedAppearance]);

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
