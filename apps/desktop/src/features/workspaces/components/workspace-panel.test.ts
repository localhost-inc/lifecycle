import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { ServiceRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryProvider } from "../../../query";
import { workspaceSupportsFilesystemInteraction } from "../lib/workspace-capabilities";

describe("workspaceSupportsFilesystemInteraction", () => {
  test("allows terminals once a worktree exists outside create and destroy", () => {
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "local",
        status: "idle",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "local",
        status: "starting",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
  });

  test("rejects workspaces without an interactive filesystem context", () => {
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "local",
        status: "idle",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "local",
        status: "idle",
        worktree_path: null,
      }),
    ).toBeFalse();
    expect(
      workspaceSupportsFilesystemInteraction({
        mode: "cloud",
        status: "active",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeFalse();
  });
});

describe("WorkspacePanel", () => {
  afterEach(() => {
    mock.restore();
  });

  test("keeps service summaries out of the workspace body", async () => {
    const services: ServiceRecord[] = [
      {
        id: "svc_1",
        workspace_id: "workspace_1",
        service_name: "desktop-web",
        exposure: "local",
        port_override: null,
        status: "stopped",
        status_reason: null,
        default_port: 1420,
        effective_port: 1420,
        preview_status: "sleeping",
        preview_failure_reason: null,
        preview_url: "http://localhost:1420",
        created_at: "2026-03-10T10:00:00.000Z",
        updated_at: "2026-03-10T10:00:00.000Z",
      },
      {
        id: "svc_2",
        workspace_id: "workspace_1",
        service_name: "worker",
        exposure: "local",
        port_override: null,
        status: "stopped",
        status_reason: null,
        default_port: 8787,
        effective_port: 8787,
        preview_status: "sleeping",
        preview_failure_reason: null,
        preview_url: "http://localhost:8787",
        created_at: "2026-03-10T10:00:00.000Z",
        updated_at: "2026-03-10T10:00:00.000Z",
      },
    ];

    const workspace: WorkspaceRecord = {
      id: "workspace_1",
      project_id: "project_1",
      name: "frost-beacon",
      source_ref: "lifecycle/frost-beacon",
      git_sha: "1dd55398",
      worktree_path: "/tmp/frost-beacon",
      mode: "local",
      status: "idle",
      manifest_fingerprint: "manifest_1",
      failure_reason: null,
      failed_at: null,
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      expires_at: null,
    };

    const hooksModule = await import("../hooks");
    const sidebarModule = await import("./workspace-sidebar");
    const surfaceModule = await import("./workspace-surface");

    spyOn(hooksModule, "useWorkspaceServices").mockReturnValue({ data: services } as never);
    spyOn(hooksModule, "useWorkspaceSetup").mockReturnValue({ data: [] } as never);
    spyOn(sidebarModule, "WorkspaceSidebar").mockImplementation((() =>
      createElement("aside", null, "Workspace Sidebar")) as never);
    spyOn(surfaceModule, "WorkspaceSurface").mockImplementation((() =>
      createElement("div", null, "Workspace Surface")) as never);

    const { WorkspacePanel } = await import("./workspace-panel");
    const markup = renderToStaticMarkup(
      createElement(QueryProvider, {
        children: createElement(WorkspacePanel, {
          manifestStatus: {
            state: "valid",
            result: {
              valid: true,
              config: {
                setup: { steps: [] },
                services: {
                  "desktop-web": {
                    runtime: "process",
                    command: "bun run dev",
                    port: 1420,
                  },
                  worker: {
                    runtime: "process",
                    command: "bun run worker",
                    port: 8787,
                  },
                },
              },
            },
          },
          workspace,
        }),
      }),
    );

    expect(markup).toContain("Workspace Surface");
    expect(markup).toContain("Workspace Sidebar");
    expect(markup).not.toContain("desktop-web");
    expect(markup).not.toContain("worker");
  });

  test("keeps environment setup progress out of the workspace body", async () => {
    const workspace: WorkspaceRecord = {
      id: "workspace_1",
      project_id: "project_1",
      name: "frost-beacon",
      source_ref: "lifecycle/frost-beacon",
      git_sha: "1dd55398",
      worktree_path: "/tmp/frost-beacon",
      mode: "local",
      status: "starting",
      manifest_fingerprint: "manifest_1",
      failure_reason: null,
      failed_at: null,
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      expires_at: null,
    };

    const hooksModule = await import("../hooks");
    const sidebarModule = await import("./workspace-sidebar");
    const surfaceModule = await import("./workspace-surface");

    spyOn(hooksModule, "useWorkspaceServices").mockReturnValue({ data: [] } as never);
    spyOn(hooksModule, "useWorkspaceSetup").mockReturnValue({
      data: [{ name: "install", output: ["bun install"], status: "completed" }],
    } as never);
    spyOn(sidebarModule, "WorkspaceSidebar").mockImplementation((() =>
      createElement("aside", null, "Workspace Sidebar")) as never);
    spyOn(surfaceModule, "WorkspaceSurface").mockImplementation((() =>
      createElement("div", null, "Workspace Surface")) as never);

    const { WorkspacePanel } = await import("./workspace-panel");
    const markup = renderToStaticMarkup(
      createElement(QueryProvider, {
        children: createElement(WorkspacePanel, {
          manifestStatus: {
            state: "valid",
            result: {
              valid: true,
              config: {
                setup: {
                  steps: [{ command: "bun install", name: "install", timeout_seconds: 60 }],
                },
                services: {
                  "desktop-web": {
                    runtime: "process",
                    command: "bun run dev",
                    port: 1420,
                  },
                },
              },
            },
          },
          workspace,
        }),
      }),
    );

    expect(markup).toContain("Workspace Surface");
    expect(markup).toContain("Workspace Sidebar");
    expect(markup).not.toContain("Setup");
    expect(markup).not.toContain("install");
  });

  test("keeps missing lifecycle manifest guidance out of the workspace body", async () => {
    const workspace: WorkspaceRecord = {
      id: "workspace_1",
      project_id: "project_1",
      name: "frost-beacon",
      source_ref: "lifecycle/frost-beacon",
      git_sha: "1dd55398",
      worktree_path: null,
      mode: "cloud",
      status: "idle",
      manifest_fingerprint: null,
      failure_reason: null,
      failed_at: null,
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      expires_at: null,
    };

    const hooksModule = await import("../hooks");
    const sidebarModule = await import("./workspace-sidebar");

    spyOn(hooksModule, "useWorkspaceServices").mockReturnValue({ data: [] } as never);
    spyOn(hooksModule, "useWorkspaceSetup").mockReturnValue({ data: [] } as never);
    spyOn(sidebarModule, "WorkspaceSidebar").mockImplementation((() =>
      createElement("aside", null, "Workspace Sidebar")) as never);

    const { WorkspacePanel } = await import("./workspace-panel");
    const markup = renderToStaticMarkup(
      createElement(QueryProvider, {
        children: createElement(WorkspacePanel, {
          manifestStatus: {
            state: "missing",
          },
          workspace,
        }),
      }),
    );

    expect(markup).toContain("Workspace surface unavailable");
    expect(markup).not.toContain("No lifecycle.json found");
    expect(markup).not.toContain("Add a lifecycle.json file to the project root");
  });
});
