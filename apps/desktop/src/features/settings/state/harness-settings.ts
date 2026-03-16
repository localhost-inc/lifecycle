import {
  buildClaudeHarnessLaunchConfig,
  buildClaudeHarnessSettingsFromPreset,
  claudeHarnessSettingsUseCustomValues,
  claudePermissionModeOptions,
  normalizeClaudeHarnessSettings,
  type ClaudeHarnessLaunchConfig,
  type ClaudeHarnessSettings,
} from "./harnesses/claude";
import {
  buildCodexHarnessLaunchConfig,
  buildCodexHarnessSettingsFromPreset,
  codexApprovalPolicyOptions,
  codexHarnessSettingsUseCustomValues,
  codexSandboxModeOptions,
  normalizeCodexHarnessSettings,
  type CodexHarnessLaunchConfig,
  type CodexHarnessSettings,
} from "./harnesses/codex";
import { harnessPresetOptions, isRecord } from "./harnesses/shared";

export type { ClaudePermissionMode } from "./harnesses/claude";
export type { CodexApprovalPolicy, CodexSandboxMode } from "./harnesses/codex";
export type { HarnessPreset } from "./harnesses/shared";
export {
  buildClaudeHarnessSettingsFromPreset,
  claudeHarnessSettingsUseCustomValues,
  claudePermissionModeOptions,
  buildCodexHarnessSettingsFromPreset,
  codexApprovalPolicyOptions,
  codexHarnessSettingsUseCustomValues,
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
