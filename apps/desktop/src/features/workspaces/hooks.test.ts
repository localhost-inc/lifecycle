import { describe, expect, test } from "bun:test";
import { createWorkspaceManifestQuery } from "@/features/workspaces/queries";
import { buildWorkspaceActivityItems } from "@/features/workspaces/state/workspace-activity";

describe("buildWorkspaceActivityItems", () => {
  test("summarizes launcher activity from fetched backend events", () => {
    const items = buildWorkspaceActivityItems([
      {
        failure_reason: null,
        id: "event-1",
        kind: "workspace.status_changed",
        occurred_at: "2026-03-10T10:00:00.000Z",
        status: "preparing",
        workspace_id: "ws_1",
      },
      {
        id: "event-2",
        kind: "service.status_changed",
        occurred_at: "2026-03-10T10:01:00.000Z",
        name: "web",
        status: "ready",
        status_reason: null,
        workspace_id: "ws_1",
      },
    ]);

    expect(items).toEqual([
      {
        detail: null,
        id: "event-1",
        kind: "workspace.status_changed",
        occurredAt: "2026-03-10T10:00:00.000Z",
        title: "Workspace preparing",
        tone: "warning",
      },
      {
        detail: null,
        id: "event-2",
        kind: "service.status_changed",
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
        kind: "service.log_line",
        occurred_at: "2026-03-10T10:00:05.000Z",
        name: "web",
        stream: "stdout",
        workspace_id: "ws_1",
      },
    ]);

    expect(items).toEqual([]);
  });
});

describe("createWorkspaceManifestQuery", () => {
  test("reads lifecycle.json from the selected workspace worktree path", async () => {
    const descriptor = createWorkspaceManifestQuery("ws_1", "/tmp/frost-grove");
    const manifestReads: string[] = [];

    const result = await descriptor.fetch({
      readManifest: async (dirPath: string) => {
        manifestReads.push(dirPath);
        return { state: "missing" } as const;
      },
    } as never);

    expect(descriptor.key).toEqual(["workspace-manifest", "ws_1"]);
    expect(manifestReads).toEqual(["/tmp/frost-grove"]);
    expect(result).toEqual({ state: "missing" });
  });
});
