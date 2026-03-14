import { describe, expect, test } from "bun:test";
import {
  isProjectRouteFocusAvailable,
  projectRouteFocusEqualsTab,
  projectRouteFocusFromTab,
  readProjectRouteFocus,
  updateProjectRouteFocus,
} from "./project-route-state";
import {
  createProjectViewTab,
  createPullRequestTab,
  createWorkspaceTab,
} from "../state/project-content-tabs";

describe("project route state", () => {
  test("reads workspace focus first when present", () => {
    expect(
      readProjectRouteFocus(new URLSearchParams("workspace=workspace_1&view=overview")),
    ).toEqual({
      kind: "workspace",
      workspaceId: "workspace_1",
    });
  });

  test("reads project-view and pull-request focus", () => {
    expect(readProjectRouteFocus(new URLSearchParams("view=overview"))).toEqual({
      kind: "project-view",
      viewId: "overview",
    });
    expect(readProjectRouteFocus(new URLSearchParams("view=pull-requests"))).toEqual({
      kind: "project-view",
      viewId: "pull-requests",
    });
    expect(readProjectRouteFocus(new URLSearchParams("view=activity"))).toEqual({
      kind: "project-view",
      viewId: "activity",
    });

    expect(readProjectRouteFocus(new URLSearchParams("pull-request=42"))).toEqual({
      kind: "pull-request",
      pullRequestNumber: 42,
    });
  });

  test("updates route focus and clears workspace-local params outside workspace tabs", () => {
    const nextSearchParams = updateProjectRouteFocus(
      new URLSearchParams("workspace=workspace_1&git=history"),
      {
        kind: "project-view",
        viewId: "overview",
      },
    );

    expect(nextSearchParams.toString()).toBe("view=overview");
  });

  test("preserves workspace-local params when focusing a workspace tab", () => {
    const nextSearchParams = updateProjectRouteFocus(new URLSearchParams("git=history"), {
      kind: "workspace",
      workspaceId: "workspace_1",
    });

    expect(nextSearchParams.toString()).toBe("git=history&workspace=workspace_1");
  });

  test("derives route focus from project content tabs", () => {
    expect(projectRouteFocusFromTab(createProjectViewTab("overview"))).toEqual({
      kind: "project-view",
      viewId: "overview",
    });
    expect(projectRouteFocusFromTab(createWorkspaceTab("workspace_1"))).toEqual({
      kind: "workspace",
      workspaceId: "workspace_1",
    });
    expect(projectRouteFocusFromTab(createPullRequestTab(42))).toEqual({
      kind: "pull-request",
      pullRequestNumber: 42,
    });
  });

  test("only treats workspace focus as available when the workspace still exists", () => {
    expect(
      isProjectRouteFocusAvailable(
        {
          kind: "workspace",
          workspaceId: "workspace_1",
        },
        {
          availableWorkspaceIds: new Set(["workspace_1"]),
        },
      ),
    ).toBeTrue();

    expect(
      isProjectRouteFocusAvailable(
        {
          kind: "workspace",
          workspaceId: "workspace_2",
        },
        {
          availableWorkspaceIds: new Set(["workspace_1"]),
        },
      ),
    ).toBeFalse();
  });

  test("compares route focus against the currently active tab", () => {
    expect(
      projectRouteFocusEqualsTab(
        {
          kind: "workspace",
          workspaceId: "workspace_1",
        },
        createWorkspaceTab("workspace_1"),
      ),
    ).toBeTrue();

    expect(
      projectRouteFocusEqualsTab(
        {
          kind: "workspace",
          workspaceId: "workspace_1",
        },
        createWorkspaceTab("workspace_2"),
      ),
    ).toBeFalse();

    expect(
      projectRouteFocusEqualsTab(
        {
          kind: "project-view",
          viewId: "overview",
        },
        createPullRequestTab(42),
      ),
    ).toBeFalse();
  });
});
