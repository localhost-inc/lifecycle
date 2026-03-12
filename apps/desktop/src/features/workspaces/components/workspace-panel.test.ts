import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  getManifestFingerprint,
  type ServiceRecord,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { QueryProvider } from "../../../query";
import { shouldSyncWorkspaceManifest } from "./workspace-panel";
import { workspaceSupportsFilesystemInteraction } from "../lib/workspace-capabilities";

function renderWorkspacePanel(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(MemoryRouter, {
      initialEntries: ["/workspaces/workspace_1"],
      children: createElement(QueryProvider, { children: element }),
    }),
  );
}

async function mockWorkspacePanelGitQueries() {
  const gitHooksModule = await import("../../git/hooks");
  spyOn(gitHooksModule, "useCurrentGitPullRequest").mockReturnValue({ data: undefined } as never);
  spyOn(gitHooksModule, "useGitPullRequest").mockReturnValue({ data: undefined } as never);
  spyOn(gitHooksModule, "useGitPullRequests").mockReturnValue({ data: undefined } as never);
}

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
      kind: "managed",
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

    spyOn(hooksModule, "useWorkspaceSetup").mockReturnValue({ data: [] } as never);
    spyOn(sidebarModule, "WorkspaceSidebar").mockImplementation((() =>
      createElement("aside", null, "Workspace Sidebar")) as never);
    spyOn(surfaceModule, "WorkspaceSurface").mockImplementation((() =>
      createElement("div", null, "Workspace Surface")) as never);
    await mockWorkspacePanelGitQueries();

    const { WorkspacePanel } = await import("./workspace-panel");
    const markup = renderWorkspacePanel(
      createElement(WorkspacePanel, {
        manifestStatus: {
          state: "valid",
          result: {
            valid: true,
            config: {
              workspace: { setup: [], teardown: [] },
              environment: {
                "desktop-web": {
                  kind: "service",
                  runtime: "process",
                  command: "bun run dev",
                  port: 1420,
                },
                worker: {
                  kind: "service",
                  runtime: "process",
                  command: "bun run worker",
                  port: 8787,
                },
              },
            },
          },
        },
        workspace,
        workspaceSnapshot: {
          services,
          terminals: [],
          workspace,
        },
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
      kind: "managed",
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

    spyOn(hooksModule, "useWorkspaceSetup").mockReturnValue({
      data: [{ name: "install", output: ["bun install"], status: "completed" }],
    } as never);
    spyOn(sidebarModule, "WorkspaceSidebar").mockImplementation((() =>
      createElement("aside", null, "Workspace Sidebar")) as never);
    spyOn(surfaceModule, "WorkspaceSurface").mockImplementation((() =>
      createElement("div", null, "Workspace Surface")) as never);
    await mockWorkspacePanelGitQueries();

    const { WorkspacePanel } = await import("./workspace-panel");
    const markup = renderWorkspacePanel(
      createElement(WorkspacePanel, {
        manifestStatus: {
          state: "valid",
          result: {
            valid: true,
            config: {
              workspace: {
                setup: [{ command: "bun install", name: "install", timeout_seconds: 60 }],
                teardown: [],
              },
              environment: {
                "desktop-web": {
                  kind: "service",
                  runtime: "process",
                  command: "bun run dev",
                  port: 1420,
                },
              },
            },
          },
        },
        workspace,
        workspaceSnapshot: {
          services: [],
          terminals: [],
          workspace,
        },
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
      kind: "managed",
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

    spyOn(hooksModule, "useWorkspaceSetup").mockReturnValue({ data: [] } as never);
    spyOn(sidebarModule, "WorkspaceSidebar").mockImplementation((() =>
      createElement("aside", null, "Workspace Sidebar")) as never);
    await mockWorkspacePanelGitQueries();

    const { WorkspacePanel } = await import("./workspace-panel");
    const markup = renderWorkspacePanel(
      createElement(WorkspacePanel, {
        manifestStatus: {
          state: "missing",
        },
        workspace,
        workspaceSnapshot: {
          services: [],
          terminals: [],
          workspace,
        },
      }),
    );

    expect(markup).toContain("Workspace surface unavailable");
    expect(markup).not.toContain("No lifecycle.json found");
    expect(markup).not.toContain("Add a lifecycle.json file to the project root");
  });
});

describe("shouldSyncWorkspaceManifest", () => {
  test("syncs idle workspaces when a valid manifest declares services but none are persisted", () => {
    expect(
      shouldSyncWorkspaceManifest(
        {
          manifest_fingerprint: null,
          status: "idle",
        } as Pick<WorkspaceRecord, "manifest_fingerprint" | "status">,
        {
          state: "valid",
          result: {
            valid: true,
            config: {
              workspace: { setup: [], teardown: [] },
              environment: {
                api: {
                  kind: "service",
                  runtime: "process",
                  command: "bun run dev",
                  port: 3000,
                },
              },
            },
          },
        },
        0,
      ),
    ).toBeTrue();
  });

  test("does not sync when the idle workspace already matches the valid manifest and has services", () => {
    const config = {
      workspace: { setup: [], teardown: [] },
      environment: {
        api: {
          kind: "service" as const,
          runtime: "process" as const,
          command: "bun run dev",
          port: 3000,
        },
      },
    };

    expect(
      shouldSyncWorkspaceManifest(
        {
          manifest_fingerprint: getManifestFingerprint(config),
          status: "idle",
        } as Pick<WorkspaceRecord, "manifest_fingerprint" | "status">,
        {
          state: "valid",
          result: {
            valid: true,
            config,
          },
        },
        1,
      ),
    ).toBeFalse();
  });

  test("syncs missing or invalid manifests when persisted service state needs cleanup", () => {
    expect(
      shouldSyncWorkspaceManifest(
        {
          manifest_fingerprint: "stale-manifest",
          status: "idle",
        } as Pick<WorkspaceRecord, "manifest_fingerprint" | "status">,
        { state: "missing" },
        2,
      ),
    ).toBeTrue();
  });
});
