import { describe, expect, test } from "bun:test";
import type { WorkspaceToolbarSlot } from "./workspace-toolbar-context";
import {
  areWorkspaceToolbarSlotsEqual,
  removeWorkspaceToolbarSlot,
  upsertWorkspaceToolbarSlot,
} from "./workspace-toolbar-context";

function createToolbarSlot(label: string): WorkspaceToolbarSlot {
  return {
    gitActionProps: null,
    restartAction: null,
    runAction: {
      disabled: false,
      label,
      loading: false,
      onClick: () => {},
    },
  };
}

describe("workspace toolbar state helpers", () => {
  test("reuses the current map when the registered slot instance is unchanged", () => {
    const slot = createToolbarSlot("Start");
    const current = { workspace_1: slot };

    expect(upsertWorkspaceToolbarSlot(current, "workspace_1", slot)).toBe(current);
  });

  test("treats slots with the same memoized segments as equal", () => {
    const runAction = {
      disabled: false,
      label: "Start",
      loading: false,
      onClick: () => {},
    };
    const gitActionProps = {
      actionError: null,
      branchPullRequest: null,
      gitStatus: null,
      isCommitting: false,
      isCreatingPullRequest: false,
      isLoading: false,
      isMergingPullRequest: false,
      isPushingBranch: false,
      onCommit: async () => {},
      onCreatePullRequest: async () => {},
      onMergePullRequest: async () => {},
      onOpenPullRequest: () => {},
      onPushBranch: async () => {},
      onShowChanges: () => {},
      variant: "outline" as const,
    };

    expect(
      areWorkspaceToolbarSlotsEqual(
        {
          gitActionProps,
          restartAction: null,
          runAction,
        },
        {
          gitActionProps,
          restartAction: null,
          runAction,
        },
      ),
    ).toBe(true);
  });

  test("replaces the workspace slot when a new slot instance is registered", () => {
    const current = { workspace_1: createToolbarSlot("Start") };
    const nextSlot = createToolbarSlot("Stop");
    const next = upsertWorkspaceToolbarSlot(current, "workspace_1", nextSlot);

    expect(next).not.toBe(current);
    expect(next.workspace_1).toBe(nextSlot);
  });

  test("reuses the current map when removing an unknown workspace slot", () => {
    const current = { workspace_1: createToolbarSlot("Start") };

    expect(removeWorkspaceToolbarSlot(current, "workspace_2")).toBe(current);
  });
});
