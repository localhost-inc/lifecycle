import { describe, expect, test } from "bun:test";
import { workspaceSurfaceReducer } from "./workspace-surface";
import { createCommitDiffTab, createFileDiffTab } from "../state/workspace-surface-state";

describe("workspaceSurfaceReducer", () => {
  test("updates an open diff tab when its scope changes", () => {
    const workingTab = createFileDiffTab("src/app.tsx", "working");

    expect(
      workspaceSurfaceReducer(
        {
          activeTabKey: workingTab.key,
          documents: [workingTab],
        },
        {
          key: workingTab.key,
          scope: "staged",
          type: "change-scope",
        },
      ),
    ).toEqual({
      activeTabKey: workingTab.key,
      documents: [
        {
          ...workingTab,
          activeScope: "staged",
        },
      ],
    });
  });

  test("ignores scope changes for non-file diff tabs", () => {
    const commitDiffTab = createCommitDiffTab("abc12345");

    expect(
      workspaceSurfaceReducer(
        {
          activeTabKey: commitDiffTab.key,
          documents: [commitDiffTab],
        },
        {
          key: commitDiffTab.key,
          scope: "staged",
          type: "change-scope",
        },
      ),
    ).toEqual({
      activeTabKey: commitDiffTab.key,
      documents: [commitDiffTab],
    });
  });
});
