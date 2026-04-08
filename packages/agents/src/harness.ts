import type { ClaudeLoginMethod } from "./providers/claude/env";
import type { CodexReasoningEffort as CodexModelReasoningEffort } from "./providers/codex/provider";

export type HarnessPreset = "guarded" | "trusted_host";

export const harnessPresetOptions = [
  {
    description: "Asks before risky operations. Recommended for most use.",
    label: "Guarded",
    value: "guarded" as const,
  },
  {
    description: "No prompts or sandboxing. For fully trusted environments only.",
    label: "Trusted Host",
    value: "trusted_host" as const,
  },
] as const;

export type ClaudeModel = string;
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

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type CodexApprovalPolicy = "never" | "on-failure" | "on-request" | "untrusted";
export type CodexModel = string;
export type CodexReasoningEffort = "default" | CodexModelReasoningEffort;

export interface CodexHarnessSettings {
  approvalPolicy: CodexApprovalPolicy;
  dangerousBypass: boolean;
  model: CodexModel;
  preset: HarnessPreset;
  reasoningEffort: CodexReasoningEffort;
  sandboxMode: CodexSandboxMode;
}

export interface CodexHarnessLaunchConfig {
  approvalPolicy: CodexApprovalPolicy;
  dangerousBypass: boolean;
  model: CodexModel;
  preset: HarnessPreset;
  provider: "codex";
  reasoningEffort: CodexReasoningEffort;
  sandboxMode: CodexSandboxMode;
}

export interface HarnessSettings {
  claude: ClaudeHarnessSettings;
  codex: CodexHarnessSettings;
}

export type HarnessLaunchConfig = CodexHarnessLaunchConfig | ClaudeHarnessLaunchConfig;

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
    description: "Maximum effort. Only exposed for models that support it.",
    label: "Max",
    value: "max" as const,
  },
] as const;

export const codexSandboxModeOptions = [
  {
    description: "Can read everything but cannot write any files.",
    label: "Read-only",
    value: "read-only" as const,
  },
  {
    description: "Can read everything, but writes are limited to the workspace directory.",
    label: "Workspace write",
    value: "workspace-write" as const,
  },
  {
    description: "Full filesystem access with no restrictions.",
    label: "Full access",
    value: "danger-full-access" as const,
  },
] as const;

export const codexApprovalPolicyOptions = [
  {
    description: "Only trusted commands run automatically. Riskier commands ask for approval.",
    label: "Untrusted",
    value: "untrusted" as const,
  },
  {
    description: "Codex decides when it needs explicit approval before proceeding.",
    label: "On request",
    value: "on-request" as const,
  },
  {
    description: "Run automatically unless a command fails and Codex asks to escalate.",
    label: "On failure",
    value: "on-failure" as const,
  },
  {
    description: "Never ask for approval. Execution failures are returned straight to Codex.",
    label: "Never",
    value: "never" as const,
  },
] as const;

export const codexReasoningEffortOptions = [
  {
    description: "Let the Codex SDK use its default reasoning setting.",
    label: "Default",
    value: "default" as const,
  },
  {
    description: "Disable reasoning and optimize for the shortest path.",
    label: "None",
    value: "none" as const,
  },
  {
    description: "Minimal reasoning for the fastest responses.",
    label: "Minimal",
    value: "minimal" as const,
  },
  {
    description: "Lower reasoning effort for quick iterations.",
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
    description: "Maximum available reasoning effort.",
    label: "XHigh",
    value: "xhigh" as const,
  },
] as const;

const validHarnessPresets = new Set<string>(harnessPresetOptions.map((option) => option.value));
const validClaudePermissionModes = new Set<string>(
  claudePermissionModeOptions.map((option) => option.value),
);
const validClaudeLoginMethods = new Set<string>(["claudeai", "console"]);
const validClaudeEfforts = new Set<string>(claudeEffortOptions.map((option) => option.value));
const validCodexSandboxModes = new Set<string>(
  codexSandboxModeOptions.map((option) => option.value),
);
const validCodexApprovalPolicies = new Set<string>(
  codexApprovalPolicyOptions.map((option) => option.value),
);
const validCodexReasoningEfforts = new Set<string>(
  codexReasoningEffortOptions.map((option) => option.value),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeHarnessPreset(value: unknown): HarnessPreset {
  if (typeof value === "string" && validHarnessPresets.has(value)) {
    return value as HarnessPreset;
  }

  return "guarded";
}

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
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return "default";
}

function normalizeClaudeEffort(value: unknown): ClaudeEffort {
  if (typeof value === "string" && validClaudeEfforts.has(value)) {
    return value as ClaudeEffort;
  }

  return "default";
}

function normalizeCodexSandboxMode(value: unknown): CodexSandboxMode {
  if (typeof value === "string" && validCodexSandboxModes.has(value)) {
    return value as CodexSandboxMode;
  }

  return "workspace-write";
}

function normalizeCodexApprovalPolicy(value: unknown): CodexApprovalPolicy {
  if (typeof value === "string" && validCodexApprovalPolicies.has(value)) {
    return value as CodexApprovalPolicy;
  }

  return "untrusted";
}

function normalizeCodexModel(value: unknown): CodexModel {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return "gpt-5.4";
}

function normalizeCodexReasoningEffort(value: unknown): CodexReasoningEffort {
  if (typeof value === "string" && validCodexReasoningEfforts.has(value)) {
    return value as CodexReasoningEffort;
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
        model: "default",
        permissionMode: "bypassPermissions",
        preset,
      };
    case "guarded":
    default:
      return {
        dangerousSkipPermissions: false,
        effort: "default",
        loginMethod: "claudeai",
        model: "default",
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

export function buildCodexHarnessSettingsFromPreset(preset: HarnessPreset): CodexHarnessSettings {
  switch (preset) {
    case "trusted_host":
      return {
        approvalPolicy: "never",
        dangerousBypass: true,
        model: "gpt-5.4",
        preset,
        reasoningEffort: "default",
        sandboxMode: "danger-full-access",
      };
    case "guarded":
    default:
      return {
        approvalPolicy: "untrusted",
        dangerousBypass: false,
        model: "gpt-5.4",
        preset: "guarded",
        reasoningEffort: "default",
        sandboxMode: "workspace-write",
      };
  }
}

export function normalizeCodexHarnessSettings(value: unknown): CodexHarnessSettings {
  if (!isRecord(value)) {
    return buildCodexHarnessSettingsFromPreset("guarded");
  }

  return {
    approvalPolicy: normalizeCodexApprovalPolicy(value.approvalPolicy),
    dangerousBypass: normalizeBoolean(value.dangerousBypass, false),
    model: normalizeCodexModel(value.model),
    preset: normalizeHarnessPreset(value.preset),
    reasoningEffort: normalizeCodexReasoningEffort(value.reasoningEffort),
    sandboxMode: normalizeCodexSandboxMode(value.sandboxMode),
  };
}

export function codexHarnessSettingsUseCustomValues(settings: CodexHarnessSettings): boolean {
  const presetSettings = buildCodexHarnessSettingsFromPreset(settings.preset);
  return (
    settings.model !== presetSettings.model ||
    settings.reasoningEffort !== presetSettings.reasoningEffort ||
    settings.sandboxMode !== presetSettings.sandboxMode ||
    settings.approvalPolicy !== presetSettings.approvalPolicy ||
    settings.dangerousBypass !== presetSettings.dangerousBypass
  );
}

export function buildCodexHarnessLaunchConfig(
  settings: CodexHarnessSettings,
): CodexHarnessLaunchConfig {
  return {
    approvalPolicy: settings.approvalPolicy,
    dangerousBypass: settings.dangerousBypass,
    model: settings.model,
    preset: settings.preset,
    provider: "codex",
    reasoningEffort: settings.reasoningEffort,
    sandboxMode: settings.sandboxMode,
  };
}

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
