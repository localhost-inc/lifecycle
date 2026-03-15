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
import {
  DEFAULT_TURN_NOTIFICATION_MODE,
  DEFAULT_TURN_NOTIFICATION_SOUND,
  normalizeTurnNotificationMode,
  normalizeTurnNotificationSound,
  type TurnNotificationMode,
  type TurnNotificationSound,
} from "../../notifications/lib/notification-settings";

export const DEFAULT_LIFECYCLE_ROOT = "~/.lifecycle";
export const DEFAULT_WORKTREE_ROOT = `${DEFAULT_LIFECYCLE_ROOT}/worktrees`;
const SETTINGS_STORAGE_KEY = "lifecycle.desktop.settings";

export type DefaultNewTabLaunch = "shell" | "claude" | "codex";

export const DEFAULT_NEW_TAB_LAUNCH: DefaultNewTabLaunch = "shell";

const VALID_NEW_TAB_LAUNCH_VALUES = new Set<string>(["shell", "claude", "codex"]);

function normalizeDefaultNewTabLaunch(
  value: string | undefined | null,
): DefaultNewTabLaunch {
  if (typeof value === "string" && VALID_NEW_TAB_LAUNCH_VALUES.has(value)) {
    return value as DefaultNewTabLaunch;
  }
  return DEFAULT_NEW_TAB_LAUNCH;
}

export interface AppSettings {
  defaultNewTabLaunch: DefaultNewTabLaunch;
  interfaceFontFamily: string;
  monospaceFontFamily: string;
  turnNotificationsMode: TurnNotificationMode;
  turnNotificationSound: TurnNotificationSound;
  worktreeRoot: string;
}

interface SettingsContextValue extends AppSettings {
  resetTypography: () => void;
  setDefaultNewTabLaunch: (value: DefaultNewTabLaunch) => void;
  setInterfaceFontFamily: (value: string) => void;
  setMonospaceFontFamily: (value: string) => void;
  setTurnNotificationSound: (value: TurnNotificationSound) => void;
  setTurnNotificationsMode: (value: TurnNotificationMode) => void;
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
    defaultNewTabLaunch: DEFAULT_NEW_TAB_LAUNCH,
    interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
    monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
    turnNotificationsMode: DEFAULT_TURN_NOTIFICATION_MODE,
    turnNotificationSound: DEFAULT_TURN_NOTIFICATION_SOUND,
    worktreeRoot: DEFAULT_WORKTREE_ROOT,
  };
}

export function parseStoredSettings(raw: string | null | undefined): AppSettings {
  const defaults = buildDefaultSettings();
  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      defaultNewTabLaunch: normalizeDefaultNewTabLaunch(parsed.defaultNewTabLaunch),
      interfaceFontFamily: normalizeFontFamily(
        parsed.interfaceFontFamily,
        defaults.interfaceFontFamily,
      ),
      monospaceFontFamily: normalizeFontFamily(
        parsed.monospaceFontFamily,
        defaults.monospaceFontFamily,
      ),
      turnNotificationsMode: normalizeTurnNotificationMode(
        parsed.turnNotificationsMode,
        defaults.turnNotificationsMode,
      ),
      turnNotificationSound: normalizeTurnNotificationSound(
        parsed.turnNotificationSound,
        defaults.turnNotificationSound,
      ),
      worktreeRoot: normalizeWorktreeRoot(parsed.worktreeRoot),
    };
  } catch {
    return defaults;
  }
}

function readStoredSettings(): AppSettings {
  if (typeof window === "undefined") return buildDefaultSettings();

  return parseStoredSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
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

  const setDefaultNewTabLaunch = useCallback(
    (value: DefaultNewTabLaunch) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          defaultNewTabLaunch: normalizeDefaultNewTabLaunch(value),
        };
        return persistSettings(next);
      });
    },
    [persistSettings],
  );

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

  const setTurnNotificationsMode = useCallback(
    (value: TurnNotificationMode) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          turnNotificationsMode: normalizeTurnNotificationMode(
            value,
            DEFAULT_TURN_NOTIFICATION_MODE,
          ),
        };
        return persistSettings(next);
      });
    },
    [persistSettings],
  );

  const setTurnNotificationSound = useCallback(
    (value: TurnNotificationSound) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          turnNotificationSound: normalizeTurnNotificationSound(
            value,
            DEFAULT_TURN_NOTIFICATION_SOUND,
          ),
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
      defaultNewTabLaunch: settings.defaultNewTabLaunch,
      interfaceFontFamily: settings.interfaceFontFamily,
      monospaceFontFamily: settings.monospaceFontFamily,
      resetTypography,
      setDefaultNewTabLaunch,
      setInterfaceFontFamily,
      setMonospaceFontFamily,
      setTurnNotificationSound,
      setTurnNotificationsMode,
      turnNotificationSound: settings.turnNotificationSound,
      turnNotificationsMode: settings.turnNotificationsMode,
      worktreeRoot: settings.worktreeRoot,
      setWorktreeRoot,
    }),
    [
      settings.defaultNewTabLaunch,
      settings.interfaceFontFamily,
      settings.monospaceFontFamily,
      settings.turnNotificationSound,
      settings.turnNotificationsMode,
      settings.worktreeRoot,
      resetTypography,
      setDefaultNewTabLaunch,
      setInterfaceFontFamily,
      setMonospaceFontFamily,
      setTurnNotificationSound,
      setTurnNotificationsMode,
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
