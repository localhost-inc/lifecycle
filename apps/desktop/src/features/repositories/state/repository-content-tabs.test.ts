import { describe, expect, test } from "bun:test";
import {
  resolvePersistedRepositorySubPath,
  resolveRepositoryNavigationTarget,
} from "@/features/repositories/state/repository-content-tabs";

describe("resolvePersistedRepositorySubPath", () => {
  test("returns null for the repository index route", () => {
    expect(
      resolvePersistedRepositorySubPath({
        pathname: "/repositories/project_1",
        repositoryId: "project_1",
        repositoryWorkspaceId: "workspace_root",
      }),
    ).toBeNull();
  });

  test("preserves non-workspace repository routes", () => {
    expect(
      resolvePersistedRepositorySubPath({
        pathname: "/repositories/project_1/activity",
        repositoryId: "project_1",
        repositoryWorkspaceId: "workspace_root",
      }),
    ).toBe("/activity");
  });

  test("canonicalizes workspace routes to the repository workspace", () => {
    expect(
      resolvePersistedRepositorySubPath({
        pathname: "/repositories/project_1/workspaces/workspace_feature",
        repositoryId: "project_1",
        repositoryWorkspaceId: "workspace_root",
      }),
    ).toBe("/workspaces/workspace_root");
  });

  test("falls back to the current workspace route when no repository workspace exists", () => {
    expect(
      resolvePersistedRepositorySubPath({
        pathname: "/repositories/project_1/workspaces/workspace_feature",
        repositoryId: "project_1",
        repositoryWorkspaceId: null,
      }),
    ).toBe("/workspaces/workspace_feature");
  });

  test("ignores paths outside the repository route", () => {
    expect(
      resolvePersistedRepositorySubPath({
        pathname: "/settings",
        repositoryId: "project_1",
        repositoryWorkspaceId: "workspace_root",
      }),
    ).toBeNull();
  });
});

describe("resolveRepositoryNavigationTarget", () => {
  test("canonicalizes stored workspace routes to the repository workspace", () => {
    expect(
      resolveRepositoryNavigationTarget({
        currentPathname: "/settings",
        repositoryId: "project_1",
        repositoryWorkspaceId: "workspace_root",
        storedSubPath: "/workspaces/workspace_feature",
      }),
    ).toBe("/repositories/project_1/workspaces/workspace_root");
  });

  test("prefers the current non-workspace route over stale stored workspace state", () => {
    expect(
      resolveRepositoryNavigationTarget({
        currentPathname: "/repositories/project_1/activity",
        repositoryId: "project_1",
        repositoryWorkspaceId: "workspace_root",
        storedSubPath: "/workspaces/workspace_feature",
      }),
    ).toBe("/repositories/project_1/activity");
  });

  test("falls back to the repository root when no route state exists", () => {
    expect(
      resolveRepositoryNavigationTarget({
        currentPathname: "/settings",
        repositoryId: "project_1",
        repositoryWorkspaceId: "workspace_root",
        storedSubPath: null,
      }),
    ).toBe("/repositories/project_1");
  });
});
