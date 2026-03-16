import { describe, expect, test } from "bun:test";
import {
  resolvePersistedProjectSubPath,
  resolveProjectNavigationTarget,
} from "./project-content-tabs";

describe("resolvePersistedProjectSubPath", () => {
  test("returns null for the project index route", () => {
    expect(
      resolvePersistedProjectSubPath({
        pathname: "/projects/project_1",
        projectId: "project_1",
        repositoryWorkspaceId: "workspace_root",
      }),
    ).toBeNull();
  });

  test("preserves non-workspace project routes", () => {
    expect(
      resolvePersistedProjectSubPath({
        pathname: "/projects/project_1/activity",
        projectId: "project_1",
        repositoryWorkspaceId: "workspace_root",
      }),
    ).toBe("/activity");
  });

  test("canonicalizes workspace routes to the repository workspace", () => {
    expect(
      resolvePersistedProjectSubPath({
        pathname: "/projects/project_1/workspaces/workspace_feature",
        projectId: "project_1",
        repositoryWorkspaceId: "workspace_root",
      }),
    ).toBe("/workspaces/workspace_root");
  });

  test("falls back to the current workspace route when no repository workspace exists", () => {
    expect(
      resolvePersistedProjectSubPath({
        pathname: "/projects/project_1/workspaces/workspace_feature",
        projectId: "project_1",
        repositoryWorkspaceId: null,
      }),
    ).toBe("/workspaces/workspace_feature");
  });

  test("ignores paths outside the project route", () => {
    expect(
      resolvePersistedProjectSubPath({
        pathname: "/settings",
        projectId: "project_1",
        repositoryWorkspaceId: "workspace_root",
      }),
    ).toBeNull();
  });
});

describe("resolveProjectNavigationTarget", () => {
  test("canonicalizes stored workspace routes to the repository workspace", () => {
    expect(
      resolveProjectNavigationTarget({
        currentPathname: "/settings",
        projectId: "project_1",
        repositoryWorkspaceId: "workspace_root",
        storedSubPath: "/workspaces/workspace_feature",
      }),
    ).toBe("/projects/project_1/workspaces/workspace_root");
  });

  test("prefers the current non-workspace route over stale stored workspace state", () => {
    expect(
      resolveProjectNavigationTarget({
        currentPathname: "/projects/project_1/activity",
        projectId: "project_1",
        repositoryWorkspaceId: "workspace_root",
        storedSubPath: "/workspaces/workspace_feature",
      }),
    ).toBe("/projects/project_1/activity");
  });

  test("falls back to the project root when no route state exists", () => {
    expect(
      resolveProjectNavigationTarget({
        currentPathname: "/settings",
        projectId: "project_1",
        repositoryWorkspaceId: "workspace_root",
        storedSubPath: null,
      }),
    ).toBe("/projects/project_1");
  });
});
