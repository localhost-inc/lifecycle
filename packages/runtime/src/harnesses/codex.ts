import type { HarnessPreset } from "./shared";

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type CodexApprovalPolicy = "untrusted" | "on-request" | "never";

export interface CodexHarnessLaunchConfigInput {
  approvalPolicy: CodexApprovalPolicy;
  dangerousBypass: boolean;
  preset: HarnessPreset;
  provider: "codex";
  sandboxMode: CodexSandboxMode;
}
