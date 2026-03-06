import type {
  WorkspaceFailureReason,
  WorkspaceServiceStatus,
  WorkspaceStatus,
} from "@lifecycle/contracts";

export type StoreEvent =
  | { kind: "projects-invalidated" }
  | { kind: "project-manifests-invalidated" }
  | { kind: "workspaces-invalidated"; workspaceId?: string }
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
