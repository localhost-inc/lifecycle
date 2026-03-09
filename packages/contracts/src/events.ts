import type { TerminalRecord } from "./db";
import type { TerminalFailureReason, TerminalStatus } from "./terminal";
import type {
  WorkspaceFailureReason,
  WorkspaceServiceStatus,
  WorkspaceServiceStatusReason,
  WorkspaceStatus,
} from "./workspace";

export type SetupStepEventType =
  | "started"
  | "stdout"
  | "stderr"
  | "completed"
  | "failed"
  | "timeout";

export type LifecycleEvent =
  | {
      id: string;
      occurred_at: string;
      type: "workspace.status_changed";
      workspace_id: string;
      status: WorkspaceStatus;
      failure_reason: WorkspaceFailureReason | null;
    }
  | {
      id: string;
      occurred_at: string;
      type: "workspace.renamed";
      workspace_id: string;
      name: string;
      worktree_path: string | null;
    }
  | {
      id: string;
      occurred_at: string;
      type: "service.status_changed";
      workspace_id: string;
      service_name: string;
      status: WorkspaceServiceStatus;
      status_reason: WorkspaceServiceStatusReason | null;
    }
  | {
      id: string;
      occurred_at: string;
      type: "setup.step_progress";
      workspace_id: string;
      step_name: string;
      event_type: SetupStepEventType;
      data: string | null;
    }
  | {
      id: string;
      occurred_at: string;
      type: "terminal.created";
      workspace_id: string;
      terminal: TerminalRecord;
    }
  | {
      id: string;
      occurred_at: string;
      type: "terminal.status_changed";
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
      type: "terminal.renamed";
      terminal_id: string;
      workspace_id: string;
      label: string;
    }
  | {
      id: string;
      occurred_at: string;
      type: "terminal.harness_turn_completed";
      terminal_id: string;
      workspace_id: string;
      harness_provider: string | null;
      harness_session_id: string | null;
      completion_key: string;
      turn_id: string | null;
    };

export type LifecycleEventType = LifecycleEvent["type"];
export type LifecycleEventOf<Type extends LifecycleEventType> = Extract<
  LifecycleEvent,
  { type: Type }
>;
export type LifecycleEventInput = {
  [Type in LifecycleEventType]: Omit<LifecycleEventOf<Type>, "id" | "occurred_at">;
}[LifecycleEventType];
