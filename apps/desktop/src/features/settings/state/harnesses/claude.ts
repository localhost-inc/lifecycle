import type { HarnessPreset } from "@/features/settings/state/harnesses/shared";
import { isRecord, normalizeBoolean, normalizeHarnessPreset } from "@/features/settings/state/harnesses/shared";

export type ClaudeLoginMethod = "claudeai" | "console";
export type ClaudeModel = "claude-haiku-4-5" | "claude-opus-4-6" | "claude-sonnet-4-6";
export type ClaudeEffort = "default" | "low" | "medium" | "high" | "max";

export type ClaudePermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan";

export interface ClaudeHarnessSettings {
  dangerousSkipPermissions: boolean;
  effort: ClaudeEffort;
  loginMethod: ClaudeLoginMethod;
  model: ClaudeModel;
  permissionMode: ClaudePermissionMode;
  preset: HarnessPreset;
}

export interface ClaudeHarnessLaunchConfig {
  dangerousSkipPermissions: boolean;
  effort: ClaudeEffort;
  loginMethod: ClaudeLoginMethod;
  model: ClaudeModel;
  permissionMode: ClaudePermissionMode;
  preset: HarnessPreset;
  provider: "claude";
}

export const claudeModelOptions = [
  {
    description: "Fastest Claude coding model in the current public lineup.",
    label: "Haiku 4.5",
    value: "claude-haiku-4-5" as const,
  },
  {
    description: "Balanced default Claude coding model.",
    label: "Sonnet 4.6",
    value: "claude-sonnet-4-6" as const,
  },
  {
    description: "Highest-capability Claude model for harder tasks.",
    label: "Opus 4.6",
    value: "claude-opus-4-6" as const,
  },
] as const;

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

export const claudeEffortOptions = [
  {
    description: "Let Claude use the model's default effort behavior.",
    label: "Default",
    value: "default" as const,
  },
  {
    description: "Minimal reasoning for the fastest responses.",
    label: "Low",
    value: "low" as const,
  },
  {
    description: "Balanced reasoning depth and latency.",
    label: "Medium",
    value: "medium" as const,
  },
  {
    description: "Deeper reasoning for more complex tasks.",
    label: "High",
    value: "high" as const,
  },
  {
    description: "Maximum effort. Only supported on Opus 4.6.",
    label: "Max",
    value: "max" as const,
  },
] as const;

const validClaudePermissionModes = new Set<string>(
  claudePermissionModeOptions.map((option) => option.value),
);

const validClaudeLoginMethods = new Set<string>(["claudeai", "console"]);
const validClaudeModels = new Set<string>(claudeModelOptions.map((option) => option.value));
const validClaudeEfforts = new Set<string>(claudeEffortOptions.map((option) => option.value));

function normalizeClaudeLoginMethod(value: unknown): ClaudeLoginMethod {
  if (typeof value === "string" && validClaudeLoginMethods.has(value)) {
    return value as ClaudeLoginMethod;
  }

  return "claudeai";
}

function normalizeClaudePermissionMode(value: unknown): ClaudePermissionMode {
  if (typeof value === "string" && validClaudePermissionModes.has(value)) {
    return value as ClaudePermissionMode;
  }

  return "acceptEdits";
}

function normalizeClaudeModel(value: unknown): ClaudeModel {
  if (typeof value === "string" && validClaudeModels.has(value)) {
    return value as ClaudeModel;
  }

  return "claude-sonnet-4-6";
}

function normalizeClaudeEffort(value: unknown): ClaudeEffort {
  if (typeof value === "string" && validClaudeEfforts.has(value)) {
    return value as ClaudeEffort;
  }

  return "default";
}

export function buildClaudeHarnessSettingsFromPreset(preset: HarnessPreset): ClaudeHarnessSettings {
  switch (preset) {
    case "trusted_host":
      return {
        dangerousSkipPermissions: true,
        effort: "default",
        loginMethod: "claudeai",
        model: "claude-sonnet-4-6",
        permissionMode: "bypassPermissions",
        preset,
      };
    case "guarded":
    default:
      return {
        dangerousSkipPermissions: false,
        effort: "default",
        loginMethod: "claudeai",
        model: "claude-sonnet-4-6",
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
    effort: normalizeClaudeEffort(value.effort),
    loginMethod: normalizeClaudeLoginMethod(value.loginMethod),
    model: normalizeClaudeModel(value.model),
    permissionMode: normalizeClaudePermissionMode(value.permissionMode),
    preset: normalizeHarnessPreset(value.preset),
  };
}

export function claudeHarnessSettingsUseCustomValues(settings: ClaudeHarnessSettings): boolean {
  const presetSettings = buildClaudeHarnessSettingsFromPreset(settings.preset);
  return (
    settings.model !== presetSettings.model ||
    settings.effort !== presetSettings.effort ||
    settings.loginMethod !== presetSettings.loginMethod ||
    settings.permissionMode !== presetSettings.permissionMode ||
    settings.dangerousSkipPermissions !== presetSettings.dangerousSkipPermissions
  );
}

export function buildClaudeHarnessLaunchConfig(
  settings: ClaudeHarnessSettings,
): ClaudeHarnessLaunchConfig {
  return {
    dangerousSkipPermissions: settings.dangerousSkipPermissions,
    effort: settings.effort,
    loginMethod: settings.loginMethod,
    model: settings.model,
    permissionMode: settings.permissionMode,
    preset: settings.preset,
    provider: "claude",
  };
}
