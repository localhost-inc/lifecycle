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
import { WorkspaceOpenRequestsProvider } from "../state/workspace-open-requests";
import { WorkspaceToolbarProvider } from "../state/workspace-toolbar-context";
import { workspaceSupportsFilesystemInteraction } from "../lib/workspace-capabilities";
import { shouldSyncWorkspaceManifest } from "../lib/workspace-manifest-sync";

function renderWorkspaceLayout(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(MemoryRouter, {
      initialEntries: ["/projects/project_1/workspaces/workspace_1"],
      children: createElement(QueryProvider, {
        children: createElement(WorkspaceOpenRequestsProvider, {
          children: createElement(WorkspaceToolbarProvider, {
            children: element,
          }),
        }),
      }),
    }),
  );
}

async function mockWorkspaceLayoutGitQueries() {
  const gitHooksModule = await import("../../git/hooks");
  spyOn(gitHooksModule, "useCurrentGitPullRequest").mockReturnValue({ data: undefined } as never);
  spyOn(gitHooksModule, "useGitLog").mockReturnValue({ data: undefined } as never);
  spyOn(gitHooksModule, "useGitPullRequest").mockReturnValue({ data: undefined } as never);
  spyOn(gitHooksModule, "useGitPullRequests").mockReturnValue({ data: undefined } as never);
  spyOn(gitHooksModule, "useGitStatus").mockReturnValue({ data: undefined } as never);
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

describe("WorkspaceLayout", () => {
  afterEach(() => {
    mock.restore();
  });

  test("keeps service summaries out of the workspace layout", async () => {
    const services: ServiceRecord[] = [
      {
        id: "svc_1",
        workspace_id: "workspace_1",
        service_name: "www",
        exposure: "local",
        port_override: null,
        status: "stopped",
        status_reason: null,
        assigned_port: 3000,
        preview_status: "sleeping",
        preview_failure_reason: null,
        preview_url: "http://127.0.0.1:3000",
        created_at: "2026-03-10T10:00:00.000Z",
        updated_at: "2026-03-10T10:00:00.000Z",
      },
      {
        id: "svc_2",
        workspace_id: "workspace_1",
        service_name: "api",
        exposure: "local",
        port_override: null,
        status: "stopped",
        status_reason: null,
        assigned_port: 8787,
        preview_status: "sleeping",
        preview_failure_reason: null,
        preview_url: "http://127.0.0.1:8787",
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
    const surfaceModule = await import("./workspace-canvas");

    spyOn(hooksModule, "useWorkspaceEnvironmentTasks").mockReturnValue({ data: [] } as never);
    spyOn(hooksModule, "useWorkspaceSetup").mockReturnValue({ data: [] } as never);
    spyOn(surfaceModule, "WorkspaceCanvas").mockImplementation((() =>
      createElement("div", null, "Workspace Surface")) as never);
    await mockWorkspaceLayoutGitQueries();

    const { WorkspaceLayout } = await import("./workspace-layout");
    const markup = renderWorkspaceLayout(
      createElement(WorkspaceLayout, {
        manifestStatus: {
          state: "valid",
          result: {
            valid: true,
            config: {
              workspace: { setup: [], teardown: [] },
              environment: {
                www: {
                  kind: "service",
                  runtime: "process",
                  command: "bun run dev",
                },
                api: {
                  kind: "service",
                  runtime: "process",
                  command: "bun run api",
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
    expect(markup).toContain('data-slot="workspace-layout"');
    expect(markup).toContain('data-slot="workspace-canvas"');
    expect(markup).toContain('data-slot="workspace-extension-strip"');
    expect(markup).not.toContain('data-slot="workspace-extension-panel"');
    expect(markup).not.toContain(">www<");
    expect(markup).not.toContain(">api<");
  });

  test("keeps environment setup progress out of the workspace layout", async () => {
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
    const surfaceModule = await import("./workspace-canvas");

    spyOn(hooksModule, "useWorkspaceEnvironmentTasks").mockReturnValue({ data: [] } as never);
    spyOn(hooksModule, "useWorkspaceSetup").mockReturnValue({
      data: [{ name: "install", output: ["bun install"], status: "completed" }],
    } as never);
    spyOn(surfaceModule, "WorkspaceCanvas").mockImplementation((() =>
      createElement("div", null, "Workspace Surface")) as never);
    await mockWorkspaceLayoutGitQueries();

    const { WorkspaceLayout } = await import("./workspace-layout");
    const markup = renderWorkspaceLayout(
      createElement(WorkspaceLayout, {
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
                www: {
                  kind: "service",
                  runtime: "process",
                  command: "bun run dev",
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
    expect(markup).toContain('data-slot="workspace-layout"');
    expect(markup).toContain('data-slot="workspace-canvas"');
    expect(markup).toContain('data-slot="workspace-extension-strip"');
    expect(markup).not.toContain('data-slot="workspace-extension-panel"');
    expect(markup).not.toContain("Setup");
    expect(markup).not.toContain("install");
  });

  test("keeps missing lifecycle manifest guidance out of the workspace layout", async () => {
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
    spyOn(hooksModule, "useWorkspaceEnvironmentTasks").mockReturnValue({ data: [] } as never);
    spyOn(hooksModule, "useWorkspaceSetup").mockReturnValue({ data: [] } as never);
    await mockWorkspaceLayoutGitQueries();

    const { WorkspaceLayout } = await import("./workspace-layout");
    const markup = renderWorkspaceLayout(
      createElement(WorkspaceLayout, {
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
    expect(markup).toContain('data-slot="workspace-layout"');
    expect(markup).toContain('data-slot="workspace-canvas"');
    expect(markup).toContain('data-slot="workspace-extension-strip"');
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
