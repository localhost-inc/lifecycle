import { createContext, useContext } from "react";
import type { ResolvedTheme, Theme } from "@lifecycle/ui";
import type {
  ClaudeHarnessSettings,
  CodexHarnessSettings,
} from "@/features/settings/state/harness-settings";
import type {
  TurnNotificationMode,
  TurnNotificationSound,
} from "@/features/notifications/lib/notification-settings";
import type { AppSettings, DefaultNewTabLaunch } from "@/features/settings/state/settings-state";

export interface SettingsContextValue extends AppSettings {
  resolvedTheme: ResolvedTheme;
  resolvedAppearance: "light" | "dark";
  resetTypography: () => void;
  setBaseFontSize: (value: number) => void;
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

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider");
  }

  return context;
}
