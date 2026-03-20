import type { HarnessPreset } from "@/features/settings/state/harnesses/shared";
import { isRecord, normalizeBoolean, normalizeHarnessPreset } from "@/features/settings/state/harnesses/shared";

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
  {
    description: "Approves file edits automatically, still asks before running commands.",
    label: "Accept edits",
    value: "acceptEdits" as const,
  },
  {
    description: "Decides when to ask based on the risk of each action.",
    label: "Auto",
    value: "auto" as const,
  },
  {
    description: "Skips every permission check. Equivalent to the skip toggle above.",
    label: "Bypass all",
    value: "bypassPermissions" as const,
  },
  {
    description: "Prompts before every tool call. Most conservative option.",
    label: "Ask every time",
    value: "default" as const,
  },
  {
    description: "Runs without prompting but still respects project-level policy files.",
    label: "Don't ask",
    value: "dontAsk" as const,
  },
  {
    description: "Can suggest changes but cannot apply them. Read-only mode.",
    label: "Plan only",
    value: "plan" as const,
  },
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
