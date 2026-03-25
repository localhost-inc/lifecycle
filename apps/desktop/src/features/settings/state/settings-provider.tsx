import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  applyThemeToRoot,
  getSystemThemeAppearance,
  resolveTheme,
  themeAppearance,
  type Theme,
} from "@lifecycle/ui";
import {
  DEFAULT_INTERFACE_FONT_FAMILY,
  DEFAULT_MONOSPACE_FONT_FAMILY,
  normalizeFontFamily,
} from "@/lib/typography";
import {
  SettingsContext,
  type SettingsContextValue,
} from "@/features/settings/state/settings-context";
import {
  applyFontSettings,
  buildDefaultSettings,
  DEFAULT_BASE_FONT_SIZE,
  normalizeBaseFontSize,
  normalizeDefaultNewTabLaunch,
  normalizeDimInactivePanes,
  normalizeInactivePaneOpacity,
  normalizeTheme,
  normalizeWorktreeRoot,
  parseSettingsJson,
  readSettingsProviderHotState,
  settingsToJson,
  type AppSettings,
  type SettingsProviderHotState,
} from "@/features/settings/state/settings-state";
import {
  normalizeClaudeHarnessSettings,
  normalizeCodexHarnessSettings,
  type ClaudeHarnessSettings,
  type CodexHarnessSettings,
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

function syncNativeWindowTheme(appearance: "light" | "dark"): void {
  if (!isTauri()) return;
  void getCurrentWindow()
    .setTheme(appearance)
    .catch((error) => {
      console.warn("Failed to sync native window theme:", error);
    });
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const hotState = readSettingsProviderHotState(import.meta.hot?.data);
  const [settings, setSettingsState] = useState<AppSettings>(
    () => hotState?.settings ?? buildDefaultSettings(),
  );
  const [systemAppearance, setSystemAppearance] = useState<"light" | "dark">(
    () => hotState?.systemAppearance ?? getSystemThemeAppearance(),
  );

  const resolvedTheme = resolveTheme(settings.theme, systemAppearance);
  const resolvedAppearance = themeAppearance(resolvedTheme);

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
    syncNativeWindowTheme(resolvedAppearance);
  }, [resolvedTheme, resolvedAppearance]);

  useEffect(() => {
    applyFontSettings(settings);
  }, [settings.baseFontSize, settings.interfaceFontFamily, settings.monospaceFontFamily]);

  useEffect(() => {
    if (!import.meta.hot) {
      return;
    }

    import.meta.hot.data.settingsProviderState = {
      settings,
      systemAppearance,
    } satisfies SettingsProviderHotState;
  }, [settings, systemAppearance]);

  const persistSettings = useCallback((next: AppSettings) => {
    writeAppSettings(settingsToJson(next));
    return next;
  }, []);

  const setBaseFontSize = useCallback(
    (value: number) => {
      setSettingsState((prev) =>
        persistSettings({ ...prev, baseFontSize: normalizeBaseFontSize(value) }),
      );
    },
    [persistSettings],
  );

  const setTheme = useCallback(
    (value: Theme) => {
      setSettingsState((prev) => persistSettings({ ...prev, theme: normalizeTheme(value) }));
    },
    [persistSettings],
  );

  const setDefaultNewTabLaunch = useCallback(
    (value: AppSettings["defaultNewTabLaunch"]) => {
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
        baseFontSize: DEFAULT_BASE_FONT_SIZE,
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
      setBaseFontSize,
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
      setBaseFontSize,
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
