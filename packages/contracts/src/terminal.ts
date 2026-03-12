export type TerminalType = "shell" | "harness" | "preset" | "command";

export type TerminalStatus = "active" | "detached" | "sleeping" | "finished" | "failed";

export type TerminalFailureReason =
  | "harness_process_exit_nonzero"
  | "attach_failed"
  | "workspace_destroyed"
  | "unknown";
