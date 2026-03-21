import type { HarnessPreset } from "./shared";

export type ClaudePermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan";

export interface ClaudeHarnessLaunchConfigInput {
  dangerousSkipPermissions: boolean;
  permissionMode: ClaudePermissionMode;
  preset: HarnessPreset;
  provider: "claude";
}
