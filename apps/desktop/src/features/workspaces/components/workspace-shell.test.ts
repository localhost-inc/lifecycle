import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { type ServiceRecord, type WorkspaceRecord } from "@lifecycle/contracts";
import type { EnvironmentClient } from "@lifecycle/environment";
import { EnvironmentClientProvider } from "@lifecycle/environment/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { mockStoreContext } from "@/test/store-mock";
import * as storeHooks from "@/store";
import { ReactQueryProvider } from "@/store/react-query-provider";
import { WorkspaceOpenRequestsProvider } from "@/features/workspaces/state/workspace-open-requests";
import { WorkspaceToolbarProvider } from "@/features/workspaces/state/workspace-toolbar-context";
import { workspaceSupportsFilesystemInteraction } from "@/features/workspaces/lib/workspace-capabilities";

function renderWorkspaceShell(element: ReturnType<typeof createElement>) {
  const environmentClient: EnvironmentClient = {
    start: async () => ({ preparedAt: null, startedServices: [] }),
    stop: async () => {},
  };

  return renderToStaticMarkup(
    createElement(MemoryRouter, {
      initialEntries: ["/projects/project_1/workspaces/workspace_1"],
      children: createElement(ReactQueryProvider, {
        children: createElement(WorkspaceOpenRequestsProvider, {
          children: createElement(WorkspaceToolbarProvider, {
            children: createElement(EnvironmentClientProvider, {
              environmentClient,
              children: element,
            }),
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
  test("allows filesystem interaction once a worktree exists outside create and archive", () => {
    expect(
      workspaceSupportsFilesystemInteraction({
        host: "local",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
    expect(
      workspaceSupportsFilesystemInteraction({
        host: "docker",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
  });

  test("rejects workspaces without an interactive filesystem context", () => {
    expect(
      workspaceSupportsFilesystemInteraction({
        host: "local",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
    expect(
      workspaceSupportsFilesystemInteraction({
        host: "local",
        worktree_path: null,
      }),
    ).toBeFalse();
    expect(
      workspaceSupportsFilesystemInteraction({
        host: "docker",
        worktree_path: null,
      }),
    ).toBeFalse();
  });
});

describe("WorkspaceShell", () => {
  beforeEach(() => mockStoreContext());
  afterEach(() => mock.restore());

  test("renders the layout with an empty services array when no services exist", async () => {
    const workspace: WorkspaceRecord = {
      id: "workspace_1",
      project_id: "project_1",
      name: "frost-beacon",
      checkout_type: "worktree",
      source_ref: "lifecycle/frost-beacon",
      git_sha: "1dd55398",
      worktree_path: "/tmp/frost-beacon",
      host: "local",
      manifest_fingerprint: "manifest_1",
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      status: "active",
      failure_reason: null,
      failed_at: null,
    };

    const surfaceModule = await import("../canvas/workspace-canvas");

    spyOn(storeHooks, "useWorkspaceServices").mockReturnValue([] as never);
    spyOn(surfaceModule, "WorkspaceCanvas").mockImplementation((() =>
      createElement("div", null, "Workspace Surface")) as never);
    await mockWorkspaceLayoutGitQueries();

    const { WorkspaceShell } = await import("./workspace-shell");
    const markup = renderWorkspaceShell(
      createElement(WorkspaceShell, {
        manifestStatus: { state: "missing" },
        workspace,
      }),
    );

    expect(markup).toContain('data-slot="workspace-shell"');
  });

  test("keeps service summaries out of the workspace layout", async () => {
    const services: ServiceRecord[] = [
      {
        id: "svc_1",
        workspace_id: "workspace_1",
        name: "www",
        status: "stopped",
        status_reason: null,
        assigned_port: 3000,
        preview_url: "http://127.0.0.1:3000",
        created_at: "2026-03-10T10:00:00.000Z",
        updated_at: "2026-03-10T10:00:00.000Z",
      },
      {
        id: "svc_2",
        workspace_id: "workspace_1",
        name: "api",
        status: "stopped",
        status_reason: null,
        assigned_port: 8787,
        preview_url: "http://127.0.0.1:8787",
        created_at: "2026-03-10T10:00:00.000Z",
        updated_at: "2026-03-10T10:00:00.000Z",
      },
    ];

    const workspace: WorkspaceRecord = {
      id: "workspace_1",
      project_id: "project_1",
      name: "frost-beacon",
      checkout_type: "worktree",
      source_ref: "lifecycle/frost-beacon",
      git_sha: "1dd55398",
      worktree_path: "/tmp/frost-beacon",
      host: "local",
      manifest_fingerprint: "manifest_1",
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      status: "active",
      failure_reason: null,
      failed_at: null,
    };

    const surfaceModule = await import("../canvas/workspace-canvas");

    spyOn(storeHooks, "useWorkspaceServices").mockReturnValue(services as never);
    spyOn(surfaceModule, "WorkspaceCanvas").mockImplementation((() =>
      createElement("div", null, "Workspace Surface")) as never);
    await mockWorkspaceLayoutGitQueries();

    const { WorkspaceShell } = await import("./workspace-shell");
    const markup = renderWorkspaceShell(
      createElement(WorkspaceShell, {
        manifestStatus: {
          state: "valid",
          result: {
            valid: true,
            config: {
              workspace: { prepare: [], teardown: [] },
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
      }),
    );

    expect(markup).toContain("Workspace Surface");
    expect(markup).toContain('data-slot="workspace-shell"');
    expect(markup).toContain('data-slot="workspace-canvas"');
    expect(markup).toContain('data-slot="workspace-extension-strip"');
    expect(markup).not.toContain('data-slot="workspace-extension-panel"');
    expect(markup).not.toContain(">www<");
    expect(markup).not.toContain(">api<");
  });

  test("keeps environment preparation details out of the workspace layout", async () => {
    const workspace: WorkspaceRecord = {
      id: "workspace_1",
      project_id: "project_1",
      name: "frost-beacon",
      checkout_type: "worktree",
      source_ref: "lifecycle/frost-beacon",
      git_sha: "1dd55398",
      worktree_path: "/tmp/frost-beacon",
      host: "local",
      manifest_fingerprint: "manifest_1",
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      status: "provisioning",
      failure_reason: null,
      failed_at: null,
    };

    const surfaceModule = await import("../canvas/workspace-canvas");

    spyOn(storeHooks, "useWorkspaceServices").mockReturnValue([] as never);
    spyOn(surfaceModule, "WorkspaceCanvas").mockImplementation((() =>
      createElement("div", null, "Workspace Surface")) as never);
    await mockWorkspaceLayoutGitQueries();

    const { WorkspaceShell } = await import("./workspace-shell");
    const markup = renderWorkspaceShell(
      createElement(WorkspaceShell, {
        manifestStatus: {
          state: "valid",
          result: {
            valid: true,
            config: {
              workspace: {
                prepare: [{ command: "bun install", name: "install", timeout_seconds: 60 }],
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
      }),
    );

    expect(markup).toContain("Workspace Surface");
    expect(markup).toContain('data-slot="workspace-shell"');
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
      checkout_type: "worktree",
      source_ref: "lifecycle/frost-beacon",
      git_sha: "1dd55398",
      worktree_path: null,
      host: "docker",
      manifest_fingerprint: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      status: "active",
      failure_reason: null,
      failed_at: null,
    };

    spyOn(storeHooks, "useWorkspaceServices").mockReturnValue([] as never);
    await mockWorkspaceLayoutGitQueries();

    const { WorkspaceShell } = await import("./workspace-shell");
    const markup = renderWorkspaceShell(
      createElement(WorkspaceShell, {
        manifestStatus: {
          state: "missing",
        },
        workspace,
      }),
    );

    expect(markup).toContain("Workspace surface unavailable");
    expect(markup).toContain('data-slot="workspace-shell"');
    expect(markup).toContain('data-slot="workspace-canvas"');
    expect(markup).toContain('data-slot="workspace-extension-strip"');
    expect(markup).not.toContain("No lifecycle.json found");
    expect(markup).not.toContain("Add a lifecycle.json file to the project root");
  });
});
