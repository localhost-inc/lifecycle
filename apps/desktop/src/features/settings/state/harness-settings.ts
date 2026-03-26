import {
  buildClaudeHarnessLaunchConfig,
  buildClaudeHarnessSettingsFromPreset,
  claudeEffortOptions,
  claudeHarnessSettingsUseCustomValues,
  claudePermissionModeOptions,
  normalizeClaudeHarnessSettings,
  type ClaudeHarnessLaunchConfig,
  type ClaudeHarnessSettings,
} from "@/features/settings/state/harnesses/claude";
import {
  buildCodexHarnessLaunchConfig,
  buildCodexHarnessSettingsFromPreset,
  codexApprovalPolicyOptions,
  codexHarnessSettingsUseCustomValues,
  codexReasoningEffortOptions,
  codexSandboxModeOptions,
  normalizeCodexHarnessSettings,
  type CodexHarnessLaunchConfig,
  type CodexHarnessSettings,
} from "@/features/settings/state/harnesses/codex";
import { harnessPresetOptions, isRecord } from "@/features/settings/state/harnesses/shared";

export type { ClaudePermissionMode } from "@/features/settings/state/harnesses/claude";
export type { ClaudeEffort, ClaudeModel } from "@/features/settings/state/harnesses/claude";
export type {
  CodexApprovalPolicy,
  CodexModel,
  CodexReasoningEffort,
  CodexSandboxMode,
} from "@/features/settings/state/harnesses/codex";
export type { HarnessPreset } from "@/features/settings/state/harnesses/shared";
export {
  buildClaudeHarnessSettingsFromPreset,
  claudeEffortOptions,
  claudeHarnessSettingsUseCustomValues,
  claudePermissionModeOptions,
  buildCodexHarnessSettingsFromPreset,
  codexApprovalPolicyOptions,
  codexHarnessSettingsUseCustomValues,
  codexReasoningEffortOptions,
  codexSandboxModeOptions,
  harnessPresetOptions,
  normalizeClaudeHarnessSettings,
  normalizeCodexHarnessSettings,
};
export type {
  ClaudeHarnessLaunchConfig,
  ClaudeHarnessSettings,
  CodexHarnessLaunchConfig,
  CodexHarnessSettings,
};

export interface HarnessSettings {
  claude: ClaudeHarnessSettings;
  codex: CodexHarnessSettings;
}

export type HarnessLaunchConfig = CodexHarnessLaunchConfig | ClaudeHarnessLaunchConfig;

export function buildDefaultHarnessSettings(): HarnessSettings {
  return {
    claude: buildClaudeHarnessSettingsFromPreset("guarded"),
    codex: buildCodexHarnessSettingsFromPreset("guarded"),
  };
}

export function normalizeHarnessSettings(value: unknown): HarnessSettings {
  if (!isRecord(value)) {
    return buildDefaultHarnessSettings();
  }

  return {
    claude: normalizeClaudeHarnessSettings(value.claude),
    codex: normalizeCodexHarnessSettings(value.codex),
  };
}

export function buildHarnessLaunchConfig(
  provider: "claude" | "codex",
  harnesses: HarnessSettings,
): HarnessLaunchConfig {
  if (provider === "codex") {
    return buildCodexHarnessLaunchConfig(harnesses.codex);
  }

  return buildClaudeHarnessLaunchConfig(harnesses.claude);
}
