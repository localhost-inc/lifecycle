import { describe, expect, test } from "bun:test";
import { buildWorkspaceActivityItems } from "@/features/workspaces/state/workspace-activity";

describe("buildWorkspaceActivityItems", () => {
  test("summarizes launcher activity from fetched backend events", () => {
    const items = buildWorkspaceActivityItems([
      {
        failureReason: null,
        id: "event-1",
        kind: "workspace.status.changed",
        occurredAt: "2026-03-10T10:00:00.000Z",
        status: "provisioning",
        workspaceId: "ws_1",
      },
      {
        id: "event-2",
        kind: "service.status.changed",
        occurredAt: "2026-03-10T10:01:00.000Z",
        name: "web",
        status: "ready",
        statusReason: null,
        workspaceId: "ws_1",
      },
    ]);

    expect(items).toEqual([
      {
        detail: null,
        id: "event-1",
        kind: "workspace.status.changed",
        occurredAt: "2026-03-10T10:00:00.000Z",
        title: "Workspace provisioning",
        tone: "neutral",
      },
      {
        detail: null,
        id: "event-2",
        kind: "service.status.changed",
        occurredAt: "2026-03-10T10:01:00.000Z",
        title: "Service web ready",
        tone: "success",
      },
    ]);
  });

  test("filters service log noise out of rendered activity", () => {
    const items = buildWorkspaceActivityItems([
      {
        line: "pulling dependencies",
        id: "event-1",
        kind: "service.log.line",
        occurredAt: "2026-03-10T10:00:05.000Z",
        name: "web",
        stream: "stdout",
        workspaceId: "ws_1",
      },
    ]);

    expect(items).toEqual([]);
  });
});
