import type {
  TerminalFailureReason,
  TerminalStatus,
  WorkspaceFailureReason,
  WorkspaceServiceStatus,
  WorkspaceStatus,
} from "@lifecycle/contracts";
import type { TerminalRow } from "../features/terminals/api";

export type StoreEvent =
  | { kind: "projects-invalidated" }
  | { kind: "project-manifests-invalidated" }
  | { kind: "workspaces-invalidated"; workspaceId?: string }
  | { kind: "terminal-created"; workspaceId: string; terminal: TerminalRow }
  | {
      kind: "terminal-status-changed";
      endedAt: string | null;
      exitCode: number | null;
      failureReason: TerminalFailureReason | null;
      status: TerminalStatus;
      terminalId: string;
      workspaceId: string;
    }
  | { kind: "terminal-removed"; terminalId: string; workspaceId: string }
  | {
      kind: "workspace-status-changed";
      workspaceId: string;
      status: WorkspaceStatus;
      failureReason: WorkspaceFailureReason | null;
    }
  | {
      kind: "workspace-service-status-changed";
      workspaceId: string;
      serviceName: string;
      status: WorkspaceServiceStatus;
      statusReason: string | null;
    }
  | {
      kind: "workspace-setup-progress";
      workspaceId: string;
      stepName: string;
      eventType: "started" | "stdout" | "stderr" | "completed" | "failed" | "timeout";
      data: string | null;
    };
