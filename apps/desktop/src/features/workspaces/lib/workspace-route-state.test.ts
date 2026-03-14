import { describe, expect, test } from "bun:test";
import { readWorkspaceRouteState, updateWorkspaceRouteState } from "./workspace-route-state";

describe("workspace route state", () => {
  test("defaults to the changes tab when query params are absent or invalid", () => {
    expect(readWorkspaceRouteState(new URLSearchParams())).toEqual({
      gitTab: "changes",
    });

    expect(readWorkspaceRouteState(new URLSearchParams("git=unknown"))).toEqual({
      gitTab: "changes",
    });
  });

  test("reads the git tab from search params", () => {
    expect(readWorkspaceRouteState(new URLSearchParams("git=history"))).toEqual({
      gitTab: "history",
    });
  });

  test("updates workspace route search params without dropping unrelated keys", () => {
    const next = updateWorkspaceRouteState(new URLSearchParams("project=project_1"), {
      gitTab: "history",
    });

    expect(next.toString()).toBe("project=project_1&git=history");
    expect(
      updateWorkspaceRouteState(next, {
        gitTab: "changes",
      }).toString(),
    ).toBe("project=project_1");
  });
});
