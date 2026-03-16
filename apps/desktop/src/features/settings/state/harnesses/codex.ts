import type { HarnessPreset } from "./shared";
import { isRecord, normalizeBoolean, normalizeHarnessPreset } from "./shared";

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type CodexApprovalPolicy = "untrusted" | "on-request" | "never";

export interface CodexHarnessSettings {
  approvalPolicy: CodexApprovalPolicy;
  dangerousBypass: boolean;
  preset: HarnessPreset;
  sandboxMode: CodexSandboxMode;
}

export interface CodexHarnessLaunchConfig {
  approvalPolicy: CodexApprovalPolicy;
  dangerousBypass: boolean;
  preset: HarnessPreset;
  provider: "codex";
  sandboxMode: CodexSandboxMode;
}

export const codexSandboxModeOptions = [
  { label: "Read-only", value: "read-only" as const },
  { label: "Workspace write", value: "workspace-write" as const },
  { label: "Danger full access", value: "danger-full-access" as const },
] as const;

export const codexApprovalPolicyOptions = [
  { label: "Untrusted", value: "untrusted" as const },
  { label: "On request", value: "on-request" as const },
  { label: "Never", value: "never" as const },
] as const;

const validCodexSandboxModes = new Set<string>(
  codexSandboxModeOptions.map((option) => option.value),
);
const validCodexApprovalPolicies = new Set<string>(
  codexApprovalPolicyOptions.map((option) => option.value),
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

export function buildCodexHarnessSettingsFromPreset(preset: HarnessPreset): CodexHarnessSettings {
  switch (preset) {
    case "trusted_host":
      return {
        approvalPolicy: "never",
        dangerousBypass: true,
        preset,
        sandboxMode: "danger-full-access",
      };
    case "guarded":
    default:
      return {
        approvalPolicy: "untrusted",
        dangerousBypass: false,
        preset: "guarded",
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
    preset: normalizeHarnessPreset(value.preset),
    sandboxMode: normalizeCodexSandboxMode(value.sandboxMode),
  };
}

export function codexHarnessSettingsUseCustomValues(settings: CodexHarnessSettings): boolean {
  const presetSettings = buildCodexHarnessSettingsFromPreset(settings.preset);
  return (
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
    preset: settings.preset,
    provider: "codex",
    sandboxMode: settings.sandboxMode,
  };
}
