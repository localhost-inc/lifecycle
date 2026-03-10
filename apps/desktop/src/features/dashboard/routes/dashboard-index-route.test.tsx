import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const onCreateWorkspace = mock(() => {});
const navigate = mock(() => {});
const useProjectCatalog = mock(() => projectCatalogState);
const useWorkspacesByProject = mock(() => workspacesByProjectState);

let searchParamsState = new URLSearchParams("project=project_1");
let lastWorkspaceIdState: string | null = null;
let projectCatalogState = {
  data: {
    projects: [
      {
        id: "project_1",
        name: "kin",
      },
    ],
  },
  isLoading: false,
};
let workspacesByProjectState: {
  data: Record<string, Array<Record<string, string | null>>> | undefined;
  isLoading: boolean;
} = {
  data: undefined,
  isLoading: false,
};

function createWorkspaceRecord(input: {
  id: string;
  lastActiveAt: string;
  name: string;
  projectId: string;
  status?: "active" | "idle" | "starting" | "stopping";
}) {
  return {
    created_at: "2026-03-08T10:00:00.000Z",
    created_by: null,
    expires_at: null,
    failed_at: null,
    failure_reason: null,
    git_sha: null,
    id: input.id,
    last_active_at: input.lastActiveAt,
    manifest_fingerprint: null,
    mode: "local" as const,
    name: input.name,
    project_id: input.projectId,
    source_ref: `refs/heads/${input.name.toLowerCase().replace(/\s+/g, "-")}`,
    source_workspace_id: null,
    status: input.status ?? "active",
    updated_at: "2026-03-08T10:00:00.000Z",
    worktree_path: `/tmp/${input.id}`,
  };
}

mock.module("react-router-dom", () => ({
  useNavigate: () => navigate,
  useOutletContext: () => ({
    onCreateWorkspace,
  }),
  useSearchParams: () => [searchParamsState],
}));

mock.module("../../projects/hooks", () => ({
  useProjectCatalog,
}));

mock.module("../../workspaces/hooks", () => ({
  useWorkspacesByProject,
}));

mock.module("../../workspaces/state/workspace-surface-state", () => ({
  readLastWorkspaceId: () => lastWorkspaceIdState,
}));

const { DashboardIndexRoute } = await import("./dashboard-index-route");

describe("DashboardIndexRoute", () => {
  beforeEach(() => {
    navigate.mockClear();
    onCreateWorkspace.mockClear();
    useProjectCatalog.mockClear();
    useWorkspacesByProject.mockClear();
    searchParamsState = new URLSearchParams("project=project_1");
    lastWorkspaceIdState = null;
    projectCatalogState = {
      data: {
        projects: [
          {
            id: "project_1",
            name: "kin",
          },
        ],
      },
      isLoading: false,
    };
    workspacesByProjectState = {
      data: undefined,
      isLoading: false,
    };
  });

  test("renders the selected-project create action with the shared primary button treatment", () => {
    const markup = renderToStaticMarkup(createElement(DashboardIndexRoute));

    expect(markup).toContain("No workspace selected");
    expect(markup).toContain("Project kin has no active workspace yet.");
    expect(markup).toContain('data-slot="button"');
    expect(markup).toContain("bg-[var(--muted)]");
    expect(markup).toContain("text-[var(--foreground)]");
    expect(markup).toContain("h-8");
    expect(markup).toContain("+ New workspace");
  });

  test("renders recent workspaces and pins the last-opened workspace first", () => {
    searchParamsState = new URLSearchParams("");
    lastWorkspaceIdState = "workspace_alpha";
    projectCatalogState = {
      data: {
        projects: [
          { id: "project_1", name: "kin" },
          { id: "project_2", name: "orbit" },
        ],
      },
      isLoading: false,
    };
    workspacesByProjectState = {
      data: {
        project_1: [
          createWorkspaceRecord({
            id: "workspace_alpha",
            lastActiveAt: "2026-03-08T10:00:00.000Z",
            name: "Alpha Workspace",
            projectId: "project_1",
          }),
        ],
        project_2: [
          createWorkspaceRecord({
            id: "workspace_beta",
            lastActiveAt: "2026-03-10T10:00:00.000Z",
            name: "Beta Workspace",
            projectId: "project_2",
            status: "idle",
          }),
        ],
      },
      isLoading: false,
    };

    const markup = renderToStaticMarkup(createElement(DashboardIndexRoute));

    expect(markup).toContain("Recent workspaces");
    expect(markup).toContain("Alpha Workspace");
    expect(markup).toContain("Beta Workspace");
    expect(markup).toContain("Last opened");
    expect(markup).toContain("kin");
    expect(markup).toContain("orbit");
    expect(markup.indexOf("Alpha Workspace")).toBeLessThan(markup.indexOf("Beta Workspace"));
  });

  test("renders quick-create project actions when there are no workspaces yet", () => {
    searchParamsState = new URLSearchParams("");
    projectCatalogState = {
      data: {
        projects: [
          { id: "project_1", name: "kin" },
          { id: "project_2", name: "orbit" },
        ],
      },
      isLoading: false,
    };
    workspacesByProjectState = {
      data: {},
      isLoading: false,
    };

    const markup = renderToStaticMarkup(createElement(DashboardIndexRoute));

    expect(markup).toContain("Create your first workspace");
    expect(markup).toContain("Start from a project");
    expect(markup).toContain('aria-label="Create workspace for kin"');
    expect(markup).toContain('aria-label="Create workspace for orbit"');
  });
});
