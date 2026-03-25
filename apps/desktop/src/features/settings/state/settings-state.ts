import { isTheme, type Theme } from "@lifecycle/ui";
import {
  DEFAULT_INTERFACE_FONT_FAMILY,
  DEFAULT_MONOSPACE_FONT_FAMILY,
  normalizeFontFamily,
} from "@/lib/typography";
import {
  buildDefaultHarnessSettings,
  normalizeHarnessSettings,
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

export const DEFAULT_LIFECYCLE_ROOT = "~/.lifecycle";
export const DEFAULT_WORKTREE_ROOT = `${DEFAULT_LIFECYCLE_ROOT}/worktrees`;

export type DefaultNewTabLaunch = "claude" | "codex";

export const DEFAULT_NEW_TAB_LAUNCH: DefaultNewTabLaunch = "codex";
export const DEFAULT_BASE_FONT_SIZE = 16;
export const DEFAULT_DIM_INACTIVE_PANES = false;
export const DEFAULT_INACTIVE_PANE_OPACITY = 0.65;

export const BASE_FONT_SIZE_OPTIONS = [
  { label: "12px", value: 12 },
  { label: "13px", value: 13 },
  { label: "14px", value: 14 },
  { label: "15px", value: 15 },
  { label: "16px (default)", value: 16 },
  { label: "17px", value: 17 },
  { label: "18px", value: 18 },
  { label: "20px", value: 20 },
] as const;

export const INACTIVE_PANE_OPACITY_OPTIONS = [
  { label: "85%", value: 0.85 },
  { label: "75%", value: 0.75 },
  { label: "65%", value: 0.65 },
  { label: "55%", value: 0.55 },
  { label: "45%", value: 0.45 },
  { label: "35%", value: 0.35 },
] as const;

const VALID_NEW_TAB_LAUNCH_VALUES = new Set<string>(["claude", "codex"]);
const VALID_BASE_FONT_SIZE_VALUES = new Set<number>(
  BASE_FONT_SIZE_OPTIONS.map((option) => option.value),
);
const VALID_INACTIVE_PANE_OPACITY_VALUES = new Set<string>(
  INACTIVE_PANE_OPACITY_OPTIONS.map((option) => option.value.toFixed(2)),
);

export interface AppSettings {
  baseFontSize: number;
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

export interface SettingsProviderHotState {
  settings: AppSettings;
  systemAppearance: "light" | "dark";
}

interface FontSettingsRoot {
  setProperty: (name: string, value: string) => void;
}

function getFontSettingsRoot(): FontSettingsRoot | null {
  if (typeof document === "undefined") {
    return null;
  }

  return document.documentElement.style;
}

export function normalizeBaseFontSize(value: number | undefined | null): number {
  if (typeof value === "number" && VALID_BASE_FONT_SIZE_VALUES.has(value)) {
    return value;
  }
  return DEFAULT_BASE_FONT_SIZE;
}

export function normalizeDefaultNewTabLaunch(
  value: string | undefined | null,
): DefaultNewTabLaunch {
  if (typeof value === "string" && VALID_NEW_TAB_LAUNCH_VALUES.has(value)) {
    return value as DefaultNewTabLaunch;
  }
  return DEFAULT_NEW_TAB_LAUNCH;
}

export function normalizeDimInactivePanes(value: boolean | undefined | null): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  return DEFAULT_DIM_INACTIVE_PANES;
}

export function normalizeInactivePaneOpacity(value: number | undefined | null): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalizedValue = value.toFixed(2);
    if (VALID_INACTIVE_PANE_OPACITY_VALUES.has(normalizedValue)) {
      return Number(normalizedValue);
    }
  }

  return DEFAULT_INACTIVE_PANE_OPACITY;
}

export function normalizeWorktreeRoot(value: string | undefined | null): string {
  if (!value) return DEFAULT_WORKTREE_ROOT;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_WORKTREE_ROOT;
}

export function normalizeTheme(value: unknown): Theme {
  if (isTheme(value)) return value;
  return "dark";
}

export function applyFontSettings(
  settings: Pick<AppSettings, "baseFontSize" | "interfaceFontFamily" | "monospaceFontFamily">,
  root: FontSettingsRoot | null = getFontSettingsRoot(),
): void {
  if (!root) {
    return;
  }

  root.setProperty("font-size", `${settings.baseFontSize}px`);
  root.setProperty("--font-heading", settings.interfaceFontFamily);
  root.setProperty("--font-body", settings.interfaceFontFamily);
  root.setProperty("--font-mono", settings.monospaceFontFamily);
}

export function buildDefaultSettings(): AppSettings {
  return {
    baseFontSize: DEFAULT_BASE_FONT_SIZE,
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

export function readSettingsProviderHotState(
  hotData: { settingsProviderState?: SettingsProviderHotState } | undefined,
): SettingsProviderHotState | null {
  const state = hotData?.settingsProviderState;
  if (!state) {
    return null;
  }

  return {
    settings: state.settings,
    systemAppearance: state.systemAppearance,
  };
}

export function parseSettingsJson(raw: Record<string, unknown> | null | undefined): AppSettings {
  const defaults = buildDefaultSettings();
  if (!raw) return defaults;

  return {
    baseFontSize: normalizeBaseFontSize(raw.baseFontSize as number),
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

export function settingsToJson(settings: AppSettings): Record<string, unknown> {
  return { ...settings };
}
