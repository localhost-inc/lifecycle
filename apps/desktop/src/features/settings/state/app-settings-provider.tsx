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
  DEFAULT_INTERFACE_FONT_FAMILY,
  DEFAULT_MONOSPACE_FONT_FAMILY,
  normalizeFontFamily,
} from "../../../lib/typography";

export const DEFAULT_LIFECYCLE_ROOT = "~/.lifecycle";
export const DEFAULT_WORKTREE_ROOT = `${DEFAULT_LIFECYCLE_ROOT}/worktrees`;
const SETTINGS_STORAGE_KEY = "lifecycle.desktop.settings";

export interface AppSettings {
  interfaceFontFamily: string;
  monospaceFontFamily: string;
  worktreeRoot: string;
}

interface SettingsContextValue extends AppSettings {
  resetTypography: () => void;
  setInterfaceFontFamily: (value: string) => void;
  setMonospaceFontFamily: (value: string) => void;
  setWorktreeRoot: (value: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

interface FontSettingsRoot {
  setProperty: (name: string, value: string) => void;
}

function getFontSettingsRoot(): FontSettingsRoot | null {
  if (typeof document === "undefined") {
    return null;
  }

  return document.documentElement.style;
}

export function applyFontSettings(
  settings: Pick<AppSettings, "interfaceFontFamily" | "monospaceFontFamily">,
  root: FontSettingsRoot | null = getFontSettingsRoot(),
): void {
  if (!root) {
    return;
  }

  root.setProperty("--font-heading", settings.interfaceFontFamily);
  root.setProperty("--font-body", settings.interfaceFontFamily);
  root.setProperty("--font-mono", settings.monospaceFontFamily);
}

function normalizeWorktreeRoot(value: string | undefined | null): string {
  if (!value) return DEFAULT_WORKTREE_ROOT;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_WORKTREE_ROOT;
}

function buildDefaultSettings(): AppSettings {
  return {
    interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
    monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
    worktreeRoot: DEFAULT_WORKTREE_ROOT,
  };
}

function readStoredSettings(): AppSettings {
  const defaults = buildDefaultSettings();
  if (typeof window === "undefined") return defaults;

  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      interfaceFontFamily: normalizeFontFamily(
        parsed.interfaceFontFamily,
        defaults.interfaceFontFamily,
      ),
      monospaceFontFamily: normalizeFontFamily(
        parsed.monospaceFontFamily,
        defaults.monospaceFontFamily,
      ),
      worktreeRoot: normalizeWorktreeRoot(parsed.worktreeRoot),
    };
  } catch {
    return defaults;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => readStoredSettings());

  const persistSettings = useCallback((next: AppSettings) => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    return next;
  }, []);

  useEffect(() => {
    applyFontSettings(settings);
  }, [settings.interfaceFontFamily, settings.monospaceFontFamily]);

  const setWorktreeRoot = useCallback(
    (value: string) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          worktreeRoot: normalizeWorktreeRoot(value),
        };
        return persistSettings(next);
      });
    },
    [persistSettings],
  );

  const setInterfaceFontFamily = useCallback(
    (value: string) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          interfaceFontFamily: normalizeFontFamily(value, DEFAULT_INTERFACE_FONT_FAMILY),
        };
        return persistSettings(next);
      });
    },
    [persistSettings],
  );

  const setMonospaceFontFamily = useCallback(
    (value: string) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          monospaceFontFamily: normalizeFontFamily(value, DEFAULT_MONOSPACE_FONT_FAMILY),
        };
        return persistSettings(next);
      });
    },
    [persistSettings],
  );

  const resetTypography = useCallback(() => {
    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
        monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
      };
      return persistSettings(next);
    });
  }, [persistSettings]);

  const contextValue = useMemo<SettingsContextValue>(
    () => ({
      interfaceFontFamily: settings.interfaceFontFamily,
      monospaceFontFamily: settings.monospaceFontFamily,
      resetTypography,
      setInterfaceFontFamily,
      setMonospaceFontFamily,
      worktreeRoot: settings.worktreeRoot,
      setWorktreeRoot,
    }),
    [
      settings.interfaceFontFamily,
      settings.monospaceFontFamily,
      settings.worktreeRoot,
      resetTypography,
      setInterfaceFontFamily,
      setMonospaceFontFamily,
      setWorktreeRoot,
    ],
  );

  return <SettingsContext.Provider value={contextValue}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }

  return context;
}
