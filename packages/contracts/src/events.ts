import type { AgentSessionRecord } from "./agent";
import type {
  ServiceStatus,
  ServiceStatusReason,
  WorkspaceFailureReason,
  WorkspaceStatus,
} from "./workspace";

export type LifecycleEventWire =
  | {
      id: string;
      occurred_at: string;
      kind: "workspace.status.changed";
      workspace_id: string;
      status: WorkspaceStatus;
      failure_reason: WorkspaceFailureReason | null;
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
      kind: "workspace.archived";
      workspace_id: string;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "workspace.file.changed";
      workspace_id: string;
      file_path: string;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "service.status.changed";
      workspace_id: string;
      name: string;
      status: ServiceStatus;
      status_reason: ServiceStatusReason | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "agent.session.created";
      workspace_id: string;
      session: AgentSessionRecord;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "agent.session.updated";
      workspace_id: string;
      session: AgentSessionRecord;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "agent.turn.completed";
      session_id: string;
      turn_id: string;
      workspace_id: string;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "service.process.exited";
      workspace_id: string;
      name: string;
      exit_code: number | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "service.log.line";
      workspace_id: string;
      name: string;
      stream: "stdout" | "stderr";
      line: string;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "git.status.changed";
      workspace_id: string;
      branch: string | null;
      head_sha: string | null;
      upstream: string | null;
    }
  | {
      id: string;
      occurred_at: string;
      kind: "git.head.changed";
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
      kind: "git.log.changed";
      workspace_id: string;
      branch: string | null;
      head_sha: string | null;
    };

export type LifecycleEvent =
  | {
      id: string;
      occurredAt: string;
      kind: "workspace.status.changed";
      workspaceId: string;
      status: WorkspaceStatus;
      failureReason: WorkspaceFailureReason | null;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "workspace.renamed";
      workspaceId: string;
      name: string;
      sourceRef: string;
      worktreePath: string | null;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "workspace.archived";
      workspaceId: string;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "workspace.file.changed";
      workspaceId: string;
      filePath: string;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "service.status.changed";
      workspaceId: string;
      name: string;
      status: ServiceStatus;
      statusReason: ServiceStatusReason | null;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "agent.session.created";
      workspaceId: string;
      session: AgentSessionRecord;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "agent.session.updated";
      workspaceId: string;
      session: AgentSessionRecord;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "agent.turn.completed";
      sessionId: string;
      turnId: string;
      workspaceId: string;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "service.process.exited";
      workspaceId: string;
      name: string;
      exitCode: number | null;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "service.log.line";
      workspaceId: string;
      name: string;
      stream: "stdout" | "stderr";
      line: string;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "git.status.changed";
      workspaceId: string;
      branch: string | null;
      headSha: string | null;
      upstream: string | null;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "git.head.changed";
      workspaceId: string;
      branch: string | null;
      headSha: string | null;
      upstream: string | null;
      ahead: number | null;
      behind: number | null;
    }
  | {
      id: string;
      occurredAt: string;
      kind: "git.log.changed";
      workspaceId: string;
      branch: string | null;
      headSha: string | null;
    };

export type LifecycleEventKind = LifecycleEvent["kind"];
export type LifecycleEventOf<Kind extends LifecycleEventKind> = Extract<
  LifecycleEvent,
  { kind: Kind }
>;
export type LifecycleEventWireOf<Kind extends LifecycleEventKind> = Extract<
  LifecycleEventWire,
  { kind: Kind }
>;
export type LifecycleEventInput = {
  [Kind in LifecycleEventKind]: Omit<LifecycleEventOf<Kind>, "id" | "occurredAt">;
}[LifecycleEventKind];
