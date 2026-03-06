import { describe, expect, test } from "bun:test";
import { workspaceSupportsTerminalInteraction } from "./workspace-panel";

describe("workspaceSupportsTerminalInteraction", () => {
  test("allows terminals once a worktree exists outside create and destroy", () => {
    expect(
      workspaceSupportsTerminalInteraction({
        status: "sleeping",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
    expect(
      workspaceSupportsTerminalInteraction({
        status: "starting",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeTrue();
  });

  test("rejects workspaces without an interactive filesystem context", () => {
    expect(
      workspaceSupportsTerminalInteraction({
        status: "creating",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeFalse();
    expect(
      workspaceSupportsTerminalInteraction({
        status: "destroying",
        worktree_path: "/tmp/worktree",
      }),
    ).toBeFalse();
    expect(
      workspaceSupportsTerminalInteraction({
        status: "sleeping",
        worktree_path: null,
      }),
    ).toBeFalse();
  });
});
