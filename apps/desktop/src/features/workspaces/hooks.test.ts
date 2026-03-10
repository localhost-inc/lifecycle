import { describe, expect, test } from "bun:test";
import type { LifecycleEvent } from "@lifecycle/contracts";
import { reduceWorkspaceActivity, type WorkspaceActivityItem } from "./hooks";

function applyActivityEvent(
  current: WorkspaceActivityItem[] | undefined,
  event: LifecycleEvent,
  workspaceId = "ws_1",
): WorkspaceActivityItem[] | undefined {
  const result = reduceWorkspaceActivity(current, event, workspaceId);
  return result.kind === "replace" ? result.data : current;
}

describe("reduceWorkspaceActivity", () => {
  test("builds launcher activity items from workspace lifecycle events", () => {
    const activity = applyActivityEvent(undefined, {
      id: "event-1",
      kind: "terminal.created",
      occurred_at: "2026-03-10T10:00:00.000Z",
      terminal: {
        created_by: null,
        ended_at: null,
        exit_code: null,
        failure_reason: null,
        harness_provider: "codex",
        harness_session_id: "session-12345678",
        id: "term-1",
        label: "Codex · Session 7",
        last_active_at: "2026-03-10T10:00:00.000Z",
        launch_type: "harness",
        started_at: "2026-03-10T10:00:00.000Z",
        status: "active",
        workspace_id: "ws_1",
      },
      workspace_id: "ws_1",
    });

    expect(activity).toEqual([
      {
        detail: "Codex · Session 7",
        id: "event-1",
        kind: "terminal.created",
        occurredAt: "2026-03-10T10:00:00.000Z",
        title: "Codex session started",
        tone: "success",
      },
    ]);
  });

  test("ignores unrelated workspace events and setup stdout noise", () => {
    const current = applyActivityEvent(undefined, {
      failure_reason: null,
      id: "event-1",
      kind: "workspace.status_changed",
      occurred_at: "2026-03-10T10:00:00.000Z",
      status: "starting",
      workspace_id: "ws_1",
    });
    const afterNoise = applyActivityEvent(current, {
      data: "pulling dependencies",
      event_kind: "stdout",
      id: "event-2",
      kind: "setup.step_progress",
      occurred_at: "2026-03-10T10:00:05.000Z",
      step_name: "Install",
      workspace_id: "ws_1",
    });
    const afterOtherWorkspace = applyActivityEvent(afterNoise, {
      id: "event-3",
      kind: "service.status_changed",
      occurred_at: "2026-03-10T10:00:10.000Z",
      service_name: "web",
      status: "ready",
      status_reason: null,
      workspace_id: "ws_2",
    });

    expect(afterOtherWorkspace).toEqual(current);
  });

  test("keeps workspace activity newest-first and bounded", () => {
    let current: WorkspaceActivityItem[] | undefined = undefined;

    for (let index = 0; index < 40; index += 1) {
      current = applyActivityEvent(current, {
        failure_reason: null,
        id: `event-${index}`,
        kind: "workspace.status_changed",
        occurred_at: `2026-03-10T10:${String(index).padStart(2, "0")}:00.000Z`,
        status: index % 2 === 0 ? "starting" : "active",
        workspace_id: "ws_1",
      });
    }

    expect(current).toHaveLength(32);
    expect(current?.[0]?.id).toBe("event-39");
    expect(current?.[31]?.id).toBe("event-8");
  });
});
