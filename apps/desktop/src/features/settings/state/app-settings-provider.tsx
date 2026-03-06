import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export const DEFAULT_WORKTREE_ROOT = "~/.lifecycle/worktrees";
const SETTINGS_STORAGE_KEY = "lifecycle.desktop.settings.v1";

export interface AppSettings {
  worktreeRoot: string;
}

interface SettingsContextValue extends AppSettings {
  setWorktreeRoot: (value: string) => void;
}

const defaultSettings: AppSettings = {
  worktreeRoot: DEFAULT_WORKTREE_ROOT,
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function normalizeWorktreeRoot(value: string | undefined | null): string {
  if (!value) return DEFAULT_WORKTREE_ROOT;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_WORKTREE_ROOT;
}

function readStoredSettings(): AppSettings {
  if (typeof window === "undefined") return defaultSettings;

  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return defaultSettings;

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      worktreeRoot: normalizeWorktreeRoot(parsed.worktreeRoot),
    };
  } catch {
    return defaultSettings;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => readStoredSettings());

  const setWorktreeRoot = useCallback((value: string) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        worktreeRoot: normalizeWorktreeRoot(value),
      };
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const contextValue = useMemo<SettingsContextValue>(
    () => ({
      worktreeRoot: settings.worktreeRoot,
      setWorktreeRoot,
    }),
    [settings.worktreeRoot, setWorktreeRoot],
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
