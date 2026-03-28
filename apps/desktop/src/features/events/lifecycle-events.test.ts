import { beforeEach, describe, expect, test } from "bun:test";
import {
  getWorkspaceActivityEvents,
  getWorkspaceServiceLogs,
  publishBrowserLifecycleEvent,
  resetLifecycleEventStoreForTests,
} from "./lifecycle-events";

describe("lifecycle event store", () => {
  beforeEach(() => {
    resetLifecycleEventStoreForTests();
  });

  test("records workspace activity separately from service log lines", () => {
    publishBrowserLifecycleEvent({
      kind: "workspace.status.changed",
      workspaceId: "ws_1",
      status: "active",
      failureReason: null,
      failedAt: null,
      gitSha: null,
      manifestFingerprint: null,
      worktreePath: "/tmp/ws_1",
    });
    publishBrowserLifecycleEvent({
      kind: "service.log.line",
      workspaceId: "ws_1",
      name: "web",
      stream: "stdout",
      line: "ready",
    });
    publishBrowserLifecycleEvent({
      kind: "service.status.changed",
      workspaceId: "ws_1",
      name: "web",
      status: "ready",
      statusReason: null,
      assignedPort: 3000,
    });

    expect(getWorkspaceActivityEvents("ws_1").map((event) => event.kind)).toEqual([
      "workspace.status.changed",
      "service.status.changed",
    ]);
  });

  test("groups service log lines by workspace service", () => {
    publishBrowserLifecycleEvent({
      kind: "service.log.line",
      workspaceId: "ws_1",
      name: "api",
      stream: "stdout",
      line: "booting",
    });
    publishBrowserLifecycleEvent({
      kind: "service.log.line",
      workspaceId: "ws_1",
      name: "api",
      stream: "stderr",
      line: "still starting",
    });

    expect(getWorkspaceServiceLogs("ws_1")).toEqual([
      {
        name: "api",
        lines: [
          { stream: "stdout", text: "booting" },
          { stream: "stderr", text: "still starting" },
        ],
      },
    ]);
  });
});
