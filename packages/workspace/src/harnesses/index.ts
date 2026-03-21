export type { ClaudePermissionMode, ClaudeHarnessLaunchConfigInput } from "./claude";
export type { CodexApprovalPolicy, CodexHarnessLaunchConfigInput, CodexSandboxMode } from "./codex";
export type { HarnessPreset } from "./shared";

import type { ClaudeHarnessLaunchConfigInput } from "./claude";
import type { CodexHarnessLaunchConfigInput } from "./codex";

export type HarnessLaunchConfigInput =
  | CodexHarnessLaunchConfigInput
  | ClaudeHarnessLaunchConfigInput;
