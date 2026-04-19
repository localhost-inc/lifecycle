import { describe, expect, test } from "bun:test";

import {
  BRIDGE_GLOBAL_TOPIC,
  buildAppSnapshotInvalidatedMessage,
  buildWorkspaceSnapshotInvalidatedMessage,
  workspaceTopic,
} from "./socket-topics";

describe("bridge socket topics", () => {
  test("uses canonical topic names", () => {
    expect(BRIDGE_GLOBAL_TOPIC).toBe("bridge.global");
    expect(workspaceTopic("ws_123")).toBe("workspace:ws_123");
  });

  test("builds app snapshot invalidation messages", () => {
    expect(buildAppSnapshotInvalidatedMessage("workspace.created")).toEqual({
      type: "snapshot.invalidated",
      resource: "app",
      reason: "workspace.created",
    });
  });

  test("builds workspace snapshot invalidation messages", () => {
    expect(
      buildWorkspaceSnapshotInvalidatedMessage({
        reason: "terminal.created",
        workspaceId: "ws_123",
      }),
    ).toEqual({
      type: "snapshot.invalidated",
      resource: "workspace",
      reason: "terminal.created",
      workspace_id: "ws_123",
    });
  });
});
