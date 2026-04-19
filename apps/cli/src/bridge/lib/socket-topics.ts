export const BRIDGE_GLOBAL_TOPIC = "bridge.global";

export function workspaceTopic(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

export type BridgeSnapshotInvalidationMessage =
  | {
      type: "snapshot.invalidated";
      resource: "app";
      reason: string;
    }
  | {
      type: "snapshot.invalidated";
      resource: "workspace";
      reason: string;
      workspace_id: string;
    };

export function buildAppSnapshotInvalidatedMessage(
  reason: string,
): BridgeSnapshotInvalidationMessage {
  return {
    type: "snapshot.invalidated",
    resource: "app",
    reason,
  };
}

export function buildWorkspaceSnapshotInvalidatedMessage(input: {
  reason: string;
  workspaceId: string;
}): BridgeSnapshotInvalidationMessage {
  return {
    type: "snapshot.invalidated",
    resource: "workspace",
    reason: input.reason,
    workspace_id: input.workspaceId,
  };
}
