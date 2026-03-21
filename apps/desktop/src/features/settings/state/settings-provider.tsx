import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  applyThemeToRoot,
  getSystemThemeAppearance,
  isTheme,
  resolveTheme,
  themeAppearance,
  type ResolvedTheme,
  type Theme,
} from "@lifecycle/ui";
import {
  DEFAULT_INTERFACE_FONT_FAMILY,
  DEFAULT_MONOSPACE_FONT_FAMILY,
  normalizeFontFamily,
} from "@/lib/typography";
import {
  buildDefaultHarnessSettings,
  normalizeClaudeHarnessSettings,
  normalizeCodexHarnessSettings,
  normalizeHarnessSettings,
  type ClaudeHarnessSettings,
  type CodexHarnessSettings,
  type HarnessSettings,
} from "@/features/settings/state/harness-settings";
import {
  DEFAULT_TURN_NOTIFICATION_MODE,
  DEFAULT_TURN_NOTIFICATION_SOUND,
  normalizeTurnNotificationMode,
  normalizeTurnNotificationSound,
  type TurnNotificationMode,
  type TurnNotificationSound,
} from "@/features/notifications/lib/notification-settings";
import { readAppSettings, writeAppSettings } from "@/lib/config";

export const DEFAULT_LIFECYCLE_ROOT = "~/.lifecycle";
export const DEFAULT_WORKTREE_ROOT = `${DEFAULT_LIFECYCLE_ROOT}/worktrees`;

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

function normalizeWorktreeRoot(value: string | undefined | null): string {
  if (!value) return DEFAULT_WORKTREE_ROOT;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_WORKTREE_ROOT;
}

function normalizeTheme(value: unknown): Theme {
  if (isTheme(value)) return value;
  return "dark";
}

export interface AppSettings {
  theme: Theme;
  defaultNewTabLaunch: DefaultNewTabLaunch;
  dimInactivePanes: boolean;
  harnesses: HarnessSettings;
  inactivePaneOpacity: number;
  interfaceFontFamily: string;
  monospaceFontFamily: string;
  turnNotificationsMode: TurnNotificationMode;
  turnNotificationSound: TurnNotificationSound;
  worktreeRoot: string;
}

interface SettingsContextValue extends AppSettings {
  resolvedTheme: ResolvedTheme;
  resolvedAppearance: "light" | "dark";
  resetTypography: () => void;
  setClaudeHarnessSettings: (value: ClaudeHarnessSettings) => void;
  setCodexHarnessSettings: (value: CodexHarnessSettings) => void;
  setDefaultNewTabLaunch: (value: DefaultNewTabLaunch) => void;
  setDimInactivePanes: (value: boolean) => void;
  setInactivePaneOpacity: (value: number) => void;
  setInterfaceFontFamily: (value: string) => void;
  setMonospaceFontFamily: (value: string) => void;
  setTheme: (value: Theme) => void;
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

function buildDefaultSettings(): AppSettings {
  return {
    theme: "dark",
    defaultNewTabLaunch: DEFAULT_NEW_TAB_LAUNCH,
    dimInactivePanes: DEFAULT_DIM_INACTIVE_PANES,
    harnesses: buildDefaultHarnessSettings(),
    inactivePaneOpacity: DEFAULT_INACTIVE_PANE_OPACITY,
    interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
    monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
    turnNotificationsMode: DEFAULT_TURN_NOTIFICATION_MODE,
    turnNotificationSound: DEFAULT_TURN_NOTIFICATION_SOUND,
    worktreeRoot: DEFAULT_WORKTREE_ROOT,
  };
}

export function parseSettingsJson(raw: Record<string, unknown> | null | undefined): AppSettings {
  const defaults = buildDefaultSettings();
  if (!raw) return defaults;

  return {
    theme: normalizeTheme(raw.theme),
    defaultNewTabLaunch: normalizeDefaultNewTabLaunch(raw.defaultNewTabLaunch as string),
    dimInactivePanes: normalizeDimInactivePanes(raw.dimInactivePanes as boolean),
    harnesses: normalizeHarnessSettings(raw.harnesses),
    inactivePaneOpacity: normalizeInactivePaneOpacity(raw.inactivePaneOpacity as number),
    interfaceFontFamily: normalizeFontFamily(
      raw.interfaceFontFamily as string,
      defaults.interfaceFontFamily,
    ),
    monospaceFontFamily: normalizeFontFamily(
      raw.monospaceFontFamily as string,
      defaults.monospaceFontFamily,
    ),
    turnNotificationsMode: normalizeTurnNotificationMode(
      raw.turnNotificationsMode as string,
      defaults.turnNotificationsMode,
    ),
    turnNotificationSound: normalizeTurnNotificationSound(
      raw.turnNotificationSound as string,
      defaults.turnNotificationSound,
    ),
    worktreeRoot: normalizeWorktreeRoot(raw.worktreeRoot as string),
  };
}

function settingsToJson(settings: AppSettings): Record<string, unknown> {
  return { ...settings };
}

function syncNativeWindowTheme(appearance: "light" | "dark"): void {
  if (!isTauri()) return;
  void getCurrentWindow()
    .setTheme(appearance)
    .catch((error) => {
      console.warn("Failed to sync native window theme:", error);
    });
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<AppSettings>(buildDefaultSettings);
  const [systemAppearance, setSystemAppearance] = useState<"light" | "dark">(() =>
    getSystemThemeAppearance(),
  );

  const resolvedTheme = resolveTheme(settings.theme, systemAppearance);
  const resolvedAppearance = themeAppearance(resolvedTheme);

  // Load settings from file on mount
  useEffect(() => {
    readAppSettings()
      .then((raw) => {
        const loaded = parseSettingsJson(raw);
        setSettingsState(loaded);
      })
      .catch((error) => {
        console.error("Failed to read app settings:", error);
      });
  }, []);

  // Watch system theme changes
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

  // Apply theme to DOM and native window
  useEffect(() => {
    applyThemeToRoot(resolvedTheme);
    syncNativeWindowTheme(resolvedAppearance);
  }, [resolvedTheme, resolvedAppearance]);

  // Apply font settings
  useEffect(() => {
    applyFontSettings(settings);
  }, [settings.interfaceFontFamily, settings.monospaceFontFamily]);

  const persistSettings = useCallback((next: AppSettings) => {
    writeAppSettings(settingsToJson(next));
    return next;
  }, []);

  const setTheme = useCallback(
    (value: Theme) => {
      setSettingsState((prev) => persistSettings({ ...prev, theme: normalizeTheme(value) }));
    },
    [persistSettings],
  );

  const setDefaultNewTabLaunch = useCallback(
    (value: DefaultNewTabLaunch) => {
      setSettingsState((prev) =>
        persistSettings({ ...prev, defaultNewTabLaunch: normalizeDefaultNewTabLaunch(value) }),
      );
    },
    [persistSettings],
  );

  const setDimInactivePanes = useCallback(
    (value: boolean) => {
      setSettingsState((prev) =>
        persistSettings({ ...prev, dimInactivePanes: normalizeDimInactivePanes(value) }),
      );
    },
    [persistSettings],
  );

  const setInactivePaneOpacity = useCallback(
    (value: number) => {
      setSettingsState((prev) =>
        persistSettings({ ...prev, inactivePaneOpacity: normalizeInactivePaneOpacity(value) }),
      );
    },
    [persistSettings],
  );

  const setCodexHarnessSettings = useCallback(
    (value: CodexHarnessSettings) => {
      setSettingsState((prev) =>
        persistSettings({
          ...prev,
          harnesses: { ...prev.harnesses, codex: normalizeCodexHarnessSettings(value) },
        }),
      );
    },
    [persistSettings],
  );

  const setClaudeHarnessSettings = useCallback(
    (value: ClaudeHarnessSettings) => {
      setSettingsState((prev) =>
        persistSettings({
          ...prev,
          harnesses: { ...prev.harnesses, claude: normalizeClaudeHarnessSettings(value) },
        }),
      );
    },
    [persistSettings],
  );

  const setWorktreeRoot = useCallback(
    (value: string) => {
      setSettingsState((prev) =>
        persistSettings({ ...prev, worktreeRoot: normalizeWorktreeRoot(value) }),
      );
    },
    [persistSettings],
  );

  const setInterfaceFontFamily = useCallback(
    (value: string) => {
      setSettingsState((prev) =>
        persistSettings({
          ...prev,
          interfaceFontFamily: normalizeFontFamily(value, DEFAULT_INTERFACE_FONT_FAMILY),
        }),
      );
    },
    [persistSettings],
  );

  const setMonospaceFontFamily = useCallback(
    (value: string) => {
      setSettingsState((prev) =>
        persistSettings({
          ...prev,
          monospaceFontFamily: normalizeFontFamily(value, DEFAULT_MONOSPACE_FONT_FAMILY),
        }),
      );
    },
    [persistSettings],
  );

  const setTurnNotificationsMode = useCallback(
    (value: TurnNotificationMode) => {
      setSettingsState((prev) =>
        persistSettings({
          ...prev,
          turnNotificationsMode: normalizeTurnNotificationMode(
            value,
            DEFAULT_TURN_NOTIFICATION_MODE,
          ),
        }),
      );
    },
    [persistSettings],
  );

  const setTurnNotificationSound = useCallback(
    (value: TurnNotificationSound) => {
      setSettingsState((prev) =>
        persistSettings({
          ...prev,
          turnNotificationSound: normalizeTurnNotificationSound(
            value,
            DEFAULT_TURN_NOTIFICATION_SOUND,
          ),
        }),
      );
    },
    [persistSettings],
  );

  const resetTypography = useCallback(() => {
    setSettingsState((prev) =>
      persistSettings({
        ...prev,
        interfaceFontFamily: DEFAULT_INTERFACE_FONT_FAMILY,
        monospaceFontFamily: DEFAULT_MONOSPACE_FONT_FAMILY,
      }),
    );
  }, [persistSettings]);

  const contextValue = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      resolvedTheme,
      resolvedAppearance,
      resetTypography,
      setClaudeHarnessSettings,
      setCodexHarnessSettings,
      setDefaultNewTabLaunch,
      setDimInactivePanes,
      setInactivePaneOpacity,
      setInterfaceFontFamily,
      setMonospaceFontFamily,
      setTheme,
      setTurnNotificationSound,
      setTurnNotificationsMode,
      setWorktreeRoot,
    }),
    [
      settings,
      resolvedTheme,
      resolvedAppearance,
      resetTypography,
      setClaudeHarnessSettings,
      setCodexHarnessSettings,
      setDefaultNewTabLaunch,
      setDimInactivePanes,
      setInactivePaneOpacity,
      setInterfaceFontFamily,
      setMonospaceFontFamily,
      setTheme,
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
