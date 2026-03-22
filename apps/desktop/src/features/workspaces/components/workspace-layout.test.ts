import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  type ServiceRecord,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { mockStoreContext } from "@/test/store-mock";
import { ReactQueryProvider } from "@/store/react-query-provider";
import { WorkspaceOpenRequestsProvider } from "@/features/workspaces/state/workspace-open-requests";
import { WorkspaceToolbarProvider } from "@/features/workspaces/state/workspace-toolbar-context";
import { workspaceSupportsFilesystemInteraction } from "@/features/workspaces/lib/workspace-capabilities";

function renderWorkspaceLayout(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(MemoryRouter, {
      initialEntries: ["/projects/project_1/workspaces/workspace_1"],
      children: createElement(ReactQueryProvider, {
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
        target: "local",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
    expect(
      workspaceSupportsFilesystemInteraction({
        target: "docker",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
  });

  test("rejects workspaces without an interactive filesystem context", () => {
    expect(
      workspaceSupportsFilesystemInteraction({
        target: "local",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
    expect(
      workspaceSupportsFilesystemInteraction({
        target: "local",
        worktree_path: null,
      }),
    ).toBeFalse();
    expect(
      workspaceSupportsFilesystemInteraction({
        target: "docker",
        worktree_path: null,
      }),
    ).toBeFalse();
  });
});

describe("WorkspaceLayout", () => {
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
      target: "local",
      manifest_fingerprint: "manifest_1",
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      expires_at: null,
      status: "active",
      failure_reason: null,
      failed_at: null,
    };

    const hooksModule = await import("../hooks");
    const surfaceModule = await import("./workspace-canvas");

    spyOn(hooksModule, "useWorkspaceServices").mockReturnValue([] as never);
    spyOn(surfaceModule, "WorkspaceCanvas").mockImplementation((() =>
      createElement("div", null, "Workspace Surface")) as never);
    await mockWorkspaceLayoutGitQueries();

    const { WorkspaceLayout } = await import("./workspace-layout");
    const markup = renderWorkspaceLayout(
      createElement(WorkspaceLayout, {
        manifestStatus: { state: "missing" },
        workspace,
      }),
    );

    expect(markup).toContain('data-slot="workspace-layout"');
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
      target: "local",
      manifest_fingerprint: "manifest_1",
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      expires_at: null,
      status: "active",
      failure_reason: null,
      failed_at: null,
    };

    const hooksModule = await import("../hooks");
    const surfaceModule = await import("./workspace-canvas");

    spyOn(hooksModule, "useWorkspaceServices").mockReturnValue(services as never);
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
    expect(markup).toContain('data-slot="workspace-layout"');
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
      target: "local",
      manifest_fingerprint: "manifest_1",
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      expires_at: null,
      status: "preparing",
      failure_reason: null,
      failed_at: null,
    };

    const hooksModule = await import("../hooks");
    const surfaceModule = await import("./workspace-canvas");

    spyOn(hooksModule, "useWorkspaceServices").mockReturnValue([] as never);
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
      checkout_type: "worktree",
      source_ref: "lifecycle/frost-beacon",
      git_sha: "1dd55398",
      worktree_path: null,
      target: "docker",
      manifest_fingerprint: null,
      created_by: null,
      source_workspace_id: null,
      created_at: "2026-03-10T10:00:00.000Z",
      updated_at: "2026-03-10T10:00:00.000Z",
      last_active_at: "2026-03-10T10:00:00.000Z",
      expires_at: null,
      status: "active",
      failure_reason: null,
      failed_at: null,
    };

    const hooksModule = await import("../hooks");
    spyOn(hooksModule, "useWorkspaceServices").mockReturnValue([] as never);
    await mockWorkspaceLayoutGitQueries();

    const { WorkspaceLayout } = await import("./workspace-layout");
    const markup = renderWorkspaceLayout(
      createElement(WorkspaceLayout, {
        manifestStatus: {
          state: "missing",
        },
        workspace,
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
