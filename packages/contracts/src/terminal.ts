export type TerminalType = "shell" | "harness" | "preset" | "command";

export type TerminalStatus = "active" | "detached" | "sleeping" | "finished" | "failed";

export type TerminalFailureReason =
  | "pty_spawn_failed"
  | "local_pty_spawn_failed"
  | "harness_process_exit_nonzero"
  | "attach_failed"
  | "workspace_destroyed"
  | "unknown";

export interface TerminalRecord {
  id: string;
  workspaceId: string;
  launchType: TerminalType;
  harnessProvider?: string;
  harnessSessionId?: string;
  createdBy?: string;
  label: string;
  status: TerminalStatus;
  failureReason?: TerminalFailureReason;
  exitCode?: number;
  startedAt: string;
  lastActiveAt: string;
  endedAt?: string;
}
