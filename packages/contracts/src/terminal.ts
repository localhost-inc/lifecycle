export type TerminalType = "shell" | "preset" | "command";

export type TerminalStatus = "active" | "detached" | "sleeping" | "finished" | "failed";

export type TerminalFailureReason =
  | "attach_failed"
  | "workspace_destroyed"
  | "unknown";
