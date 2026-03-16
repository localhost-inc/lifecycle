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
export const DEFAULT_DIM_INACTIVE_PANES = false;
export const DEFAULT_INACTIVE_PANE_OPACITY = 0.65;

export const INACTIVE_PANE_OPACITY_OPTIONS = [
  { label: "85%", value: 0.85 },
  { label: "75%", value: 0.75 },
  { label: "65%", value: 0.65 },
  { label: "55%", value: 0.55 },
  { label: "45%", value: 0.45 },
  { label: "35%", value: 0.35 },
] as const;

const VALID_NEW_TAB_LAUNCH_VALUES = new Set<string>(["shell", "claude", "codex"]);
const VALID_INACTIVE_PANE_OPACITY_VALUES = new Set<string>(
  INACTIVE_PANE_OPACITY_OPTIONS.map((option) => option.value.toFixed(2)),
);

function normalizeDefaultNewTabLaunch(value: string | undefined | null): DefaultNewTabLaunch {
  if (typeof value === "string" && VALID_NEW_TAB_LAUNCH_VALUES.has(value)) {
    return value as DefaultNewTabLaunch;
  }
  return DEFAULT_NEW_TAB_LAUNCH;
}

function normalizeDimInactivePanes(value: boolean | undefined | null): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return DEFAULT_DIM_INACTIVE_PANES;
}

function normalizeInactivePaneOpacity(value: number | undefined | null): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalizedValue = value.toFixed(2);
    if (VALID_INACTIVE_PANE_OPACITY_VALUES.has(normalizedValue)) {
      return Number(normalizedValue);
    }
  }

  return DEFAULT_INACTIVE_PANE_OPACITY;
}

export interface AppSettings {
  defaultNewTabLaunch: DefaultNewTabLaunch;
  dimInactivePanes: boolean;
  inactivePaneOpacity: number;
  interfaceFontFamily: string;
  monospaceFontFamily: string;
  turnNotificationsMode: TurnNotificationMode;
  turnNotificationSound: TurnNotificationSound;
  worktreeRoot: string;
}

interface SettingsContextValue extends AppSettings {
  resetTypography: () => void;
  setDefaultNewTabLaunch: (value: DefaultNewTabLaunch) => void;
  setDimInactivePanes: (value: boolean) => void;
  setInactivePaneOpacity: (value: number) => void;
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
    dimInactivePanes: DEFAULT_DIM_INACTIVE_PANES,
    inactivePaneOpacity: DEFAULT_INACTIVE_PANE_OPACITY,
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
      dimInactivePanes: normalizeDimInactivePanes(parsed.dimInactivePanes),
      inactivePaneOpacity: normalizeInactivePaneOpacity(parsed.inactivePaneOpacity),
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

  const setDimInactivePanes = useCallback(
    (value: boolean) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          dimInactivePanes: normalizeDimInactivePanes(value),
        };
        return persistSettings(next);
      });
    },
    [persistSettings],
  );

  const setInactivePaneOpacity = useCallback(
    (value: number) => {
      setSettings((prev) => {
        const next = {
          ...prev,
          inactivePaneOpacity: normalizeInactivePaneOpacity(value),
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
      dimInactivePanes: settings.dimInactivePanes,
      inactivePaneOpacity: settings.inactivePaneOpacity,
      interfaceFontFamily: settings.interfaceFontFamily,
      monospaceFontFamily: settings.monospaceFontFamily,
      resetTypography,
      setDefaultNewTabLaunch,
      setDimInactivePanes,
      setInactivePaneOpacity,
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
      settings.dimInactivePanes,
      settings.inactivePaneOpacity,
      settings.interfaceFontFamily,
      settings.monospaceFontFamily,
      settings.turnNotificationSound,
      settings.turnNotificationsMode,
      settings.worktreeRoot,
      resetTypography,
      setDefaultNewTabLaunch,
      setDimInactivePanes,
      setInactivePaneOpacity,
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
