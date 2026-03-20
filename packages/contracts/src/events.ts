import type { TerminalRecord } from "./db";
import type { TerminalFailureReason, TerminalStatus } from "./terminal";
import type {
  EnvironmentFailureReason,
  EnvironmentStatus,
  ServiceStatus,
  ServiceStatusReason,
} from "./workspace";

export type LifecycleEvent =
  | {
      id: string;
      occurred_at: string;
      kind: "environment.status_changed";
      workspace_id: string;
      status: EnvironmentStatus;
      failure_reason: EnvironmentFailureReason | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "workspace.renamed";
      workspace_id: string;
      name: string;
      source_ref: string;
      worktree_path: string | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "workspace.deleted";
      workspace_id: string;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "service.status_changed";
      workspace_id: string;
      name: string;
      status: ServiceStatus;
      status_reason: ServiceStatusReason | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "terminal.created";
      workspace_id: string;
      terminal: TerminalRecord;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "terminal.updated";
      workspace_id: string;
      terminal: TerminalRecord;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "terminal.status_changed";
      terminal_id: string;
      workspace_id: string;
      status: TerminalStatus;
      failure_reason: TerminalFailureReason | null;
      exit_code: number | null;
      ended_at: string | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "terminal.renamed";
      terminal_id: string;
      workspace_id: string;
      label: string;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "terminal.harness_prompt_submitted";
      terminal_id: string;
      workspace_id: string;
      prompt_text: string;
      harness_provider: string | null;
      harness_session_id: string | null;
      turn_id: string | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "terminal.harness_turn_completed";
      terminal_id: string;
      workspace_id: string;
      harness_provider: string | null;
      harness_session_id: string | null;
      completion_key: string;
      turn_id: string | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "service.process_exited";
      workspace_id: string;
      name: string;
      exit_code: number | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "service.log_line";
      workspace_id: string;
      name: string;
      stream: "stdout" | "stderr";
      line: string;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "git.status_changed";
      workspace_id: string;
      branch: string | null;
      head_sha: string | null;
      upstream: string | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "git.head_changed";
      workspace_id: string;
      branch: string | null;
      head_sha: string | null;
      upstream: string | null;
      ahead: number | null;
      behind: number | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "git.log_changed";
      workspace_id: string;
      branch: string | null;
      head_sha: string | null;
    };

export type LifecycleEventKind = LifecycleEvent["kind"];
export type LifecycleEventOf<Kind extends LifecycleEventKind> = Extract<
  LifecycleEvent,
  { kind: Kind }
>;
export type LifecycleEventInput = {
  [Kind in LifecycleEventKind]: Omit<LifecycleEventOf<Kind>, "id" | "occurred_at">;
}[LifecycleEventKind];
