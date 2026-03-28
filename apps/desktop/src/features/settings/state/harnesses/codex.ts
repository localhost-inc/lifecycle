import type { CodexReasoningEffort as CodexModelReasoningEffort } from "@lifecycle/agents";
import type { HarnessPreset } from "@/features/settings/state/harnesses/shared";
import {
  isRecord,
  normalizeBoolean,
  normalizeHarnessPreset,
} from "@/features/settings/state/harnesses/shared";

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

const validCodexSandboxModes = new Set<string>(
  codexSandboxModeOptions.map((option) => option.value),
);
const validCodexApprovalPolicies = new Set<string>(
  codexApprovalPolicyOptions.map((option) => option.value),
);
const validCodexReasoningEfforts = new Set<string>(
  codexReasoningEffortOptions.map((option) => option.value),
);

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
