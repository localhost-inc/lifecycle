import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_TERMINAL_RENDERER,
  DEFAULT_TERMINAL_FONT_SIZE,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  getDefaultTerminalFontFamily,
  normalizeTerminalFontFamily,
  normalizeTerminalFontSize,
  normalizeTerminalLineHeight,
  normalizeTerminalRenderer,
  type TerminalRenderer,
  type TerminalRuntimeDiagnostics,
} from "../../terminals/terminal-display";

export const DEFAULT_WORKTREE_ROOT = "~/.lifecycle/worktrees";
const SETTINGS_STORAGE_KEY = "lifecycle.desktop.settings.v1";

export interface AppSettings {
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalRenderer: TerminalRenderer;
  worktreeRoot: string;
}

interface SettingsContextValue extends AppSettings {
  reportTerminalDiagnostics: (value: TerminalRuntimeDiagnostics | null) => void;
  resetTerminalDisplay: () => void;
  setTerminalFontFamily: (value: string) => void;
  setTerminalFontSize: (value: number | string) => void;
  setTerminalLineHeight: (value: number | string) => void;
  setTerminalRenderer: (value: TerminalRenderer | string) => void;
  setWorktreeRoot: (value: string) => void;
  terminalDiagnostics: TerminalRuntimeDiagnostics | null;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function normalizeWorktreeRoot(value: string | undefined | null): string {
  if (!value) return DEFAULT_WORKTREE_ROOT;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_WORKTREE_ROOT;
}

function buildDefaultSettings(): AppSettings {
  return {
    terminalFontFamily: getDefaultTerminalFontFamily(),
    terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
    terminalLineHeight: DEFAULT_TERMINAL_LINE_HEIGHT,
    terminalRenderer: DEFAULT_TERMINAL_RENDERER,
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
      terminalFontFamily: normalizeTerminalFontFamily(parsed.terminalFontFamily),
      terminalFontSize: normalizeTerminalFontSize(parsed.terminalFontSize),
      terminalLineHeight: normalizeTerminalLineHeight(parsed.terminalLineHeight),
      terminalRenderer: normalizeTerminalRenderer(parsed.terminalRenderer),
      worktreeRoot: normalizeWorktreeRoot(parsed.worktreeRoot),
    };
  } catch {
    return defaults;
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => readStoredSettings());
  const [terminalDiagnostics, setTerminalDiagnostics] = useState<TerminalRuntimeDiagnostics | null>(
    null,
  );

  const persistSettings = useCallback((next: AppSettings) => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
    return next;
  }, []);

  const setWorktreeRoot = useCallback((value: string) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        worktreeRoot: normalizeWorktreeRoot(value),
      };
      return persistSettings(next);
    });
  }, [persistSettings]);

  const setTerminalFontFamily = useCallback(
    (value: string) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          terminalFontFamily: normalizeTerminalFontFamily(value),
        };
        return persistSettings(next);
      });
    },
    [persistSettings],
  );

  const setTerminalFontSize = useCallback(
    (value: number | string) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          terminalFontSize: normalizeTerminalFontSize(value),
        };
        return persistSettings(next);
      });
    },
    [persistSettings],
  );

  const setTerminalLineHeight = useCallback(
    (value: number | string) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          terminalLineHeight: normalizeTerminalLineHeight(value),
        };
        return persistSettings(next);
      });
    },
    [persistSettings],
  );

  const setTerminalRenderer = useCallback(
    (value: TerminalRenderer | string) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          terminalRenderer: normalizeTerminalRenderer(value),
        };
        return persistSettings(next);
      });
    },
    [persistSettings],
  );

  const resetTerminalDisplay = useCallback(() => {
    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        terminalFontFamily: getDefaultTerminalFontFamily(),
        terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
        terminalLineHeight: DEFAULT_TERMINAL_LINE_HEIGHT,
        terminalRenderer: DEFAULT_TERMINAL_RENDERER,
      };
      return persistSettings(next);
    });
  }, [persistSettings]);

  const reportTerminalDiagnostics = useCallback((value: TerminalRuntimeDiagnostics | null) => {
    setTerminalDiagnostics(value);
  }, []);

  const contextValue = useMemo<SettingsContextValue>(
    () => ({
      reportTerminalDiagnostics,
      resetTerminalDisplay,
      setTerminalFontFamily,
      setTerminalFontSize,
      setTerminalLineHeight,
      setTerminalRenderer,
      worktreeRoot: settings.worktreeRoot,
      terminalDiagnostics,
      terminalRenderer: settings.terminalRenderer,
      terminalFontFamily: settings.terminalFontFamily,
      terminalFontSize: settings.terminalFontSize,
      terminalLineHeight: settings.terminalLineHeight,
      setWorktreeRoot,
    }),
    [
      reportTerminalDiagnostics,
      resetTerminalDisplay,
      setTerminalFontFamily,
      setTerminalFontSize,
      setTerminalLineHeight,
      setTerminalRenderer,
      settings.worktreeRoot,
      settings.terminalRenderer,
      settings.terminalFontFamily,
      settings.terminalFontSize,
      settings.terminalLineHeight,
      setWorktreeRoot,
      terminalDiagnostics,
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
