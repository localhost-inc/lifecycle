import type { HarnessPreset } from "./shared";
import { isRecord, normalizeBoolean, normalizeHarnessPreset } from "./shared";

export type ClaudePermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan";

export interface ClaudeHarnessSettings {
  dangerousSkipPermissions: boolean;
  permissionMode: ClaudePermissionMode;
  preset: HarnessPreset;
}

export interface ClaudeHarnessLaunchConfig {
  dangerousSkipPermissions: boolean;
  permissionMode: ClaudePermissionMode;
  preset: HarnessPreset;
  provider: "claude";
}

export const claudePermissionModeOptions = [
  { label: "Accept edits", value: "acceptEdits" as const },
  { label: "Auto", value: "auto" as const },
  { label: "Bypass permissions", value: "bypassPermissions" as const },
  { label: "Default", value: "default" as const },
  { label: "Don't ask", value: "dontAsk" as const },
  { label: "Plan", value: "plan" as const },
] as const;

const validClaudePermissionModes = new Set<string>(
  claudePermissionModeOptions.map((option) => option.value),
);

function normalizeClaudePermissionMode(value: unknown): ClaudePermissionMode {
  if (typeof value === "string" && validClaudePermissionModes.has(value)) {
    return value as ClaudePermissionMode;
  }

  return "acceptEdits";
}

export function buildClaudeHarnessSettingsFromPreset(preset: HarnessPreset): ClaudeHarnessSettings {
  switch (preset) {
    case "trusted_host":
      return {
        dangerousSkipPermissions: true,
        permissionMode: "bypassPermissions",
        preset,
      };
    case "guarded":
    default:
      return {
        dangerousSkipPermissions: false,
        permissionMode: "acceptEdits",
        preset: "guarded",
      };
  }
}

export function normalizeClaudeHarnessSettings(value: unknown): ClaudeHarnessSettings {
  if (!isRecord(value)) {
    return buildClaudeHarnessSettingsFromPreset("guarded");
  }

  return {
    dangerousSkipPermissions: normalizeBoolean(value.dangerousSkipPermissions, false),
    permissionMode: normalizeClaudePermissionMode(value.permissionMode),
    preset: normalizeHarnessPreset(value.preset),
  };
}

export function claudeHarnessSettingsUseCustomValues(settings: ClaudeHarnessSettings): boolean {
  const presetSettings = buildClaudeHarnessSettingsFromPreset(settings.preset);
  return (
    settings.permissionMode !== presetSettings.permissionMode ||
    settings.dangerousSkipPermissions !== presetSettings.dangerousSkipPermissions
  );
}

export function buildClaudeHarnessLaunchConfig(
  settings: ClaudeHarnessSettings,
): ClaudeHarnessLaunchConfig {
  return {
    dangerousSkipPermissions: settings.dangerousSkipPermissions,
    permissionMode: settings.permissionMode,
    preset: settings.preset,
    provider: "claude",
  };
}
