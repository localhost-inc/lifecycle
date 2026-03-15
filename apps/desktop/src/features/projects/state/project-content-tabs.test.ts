import { describe, expect, test } from "bun:test";
import {
  clearLastProjectId,
  canCloseProjectContentTab,
  closeProjectContentTab,
  createDefaultProjectContentTabsState,
  createPullRequestTab,
  createProjectViewTab,
  createWorkspaceTab,
  focusProjectViewTab,
  focusPullRequestTab,
  focusWorkspaceTab,
  normalizeProjectContentTabsState,
  readLastProjectId,
  readProjectContentTabsState,
  reorderProjectContentTabs,
  resolveProjectContentTabIdToClose,
  writeLastProjectId,
  workspaceTabId,
  writeProjectContentTabsState,
} from "./project-content-tabs";

function createStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("project content tabs", () => {
  test("keeps overview as the durable root tab", () => {
    const state = closeProjectContentTab(createDefaultProjectContentTabsState(), "view:overview");
    expect(state.tabs).toEqual([createProjectViewTab("overview")]);
    expect(state.activeTabId).toBe("view:overview");
  });

  test("opens and focuses workspace tabs without duplicating them", () => {
    const first = focusWorkspaceTab(createDefaultProjectContentTabsState(), "workspace_1");
    const second = focusWorkspaceTab(first, "workspace_1");

    expect(second.tabs).toEqual([
      createProjectViewTab("overview"),
      createWorkspaceTab("workspace_1"),
    ]);
    expect(second.activeTabId).toBe(workspaceTabId("workspace_1"));
  });

  test("prunes missing workspace tabs while preserving project-scoped tabs", () => {
    const state = normalizeProjectContentTabsState(
      {
        activeTabId: "workspace:workspace_1",
        tabs: [
          createProjectViewTab("overview"),
          createWorkspaceTab("workspace_1"),
          createPullRequestTab(42),
        ],
      },
      {
        availableWorkspaceIds: new Set<string>(["workspace_2"]),
      },
    );

    expect(state.tabs).toEqual([createProjectViewTab("overview"), createPullRequestTab(42)]);
    expect(state.activeTabId).toBe("pull-request:42");
  });

  test("falls back to a neighboring tab when the active tab closes", () => {
    const state = {
      activeTabId: "pull-request:42",
      tabs: [
        createProjectViewTab("overview"),
        createWorkspaceTab("workspace_1"),
        createPullRequestTab(42),
      ],
    };
    const nextState = closeProjectContentTab(state, "pull-request:42");

    expect(nextState.tabs).toEqual([
      createProjectViewTab("overview"),
      createWorkspaceTab("workspace_1"),
    ]);
    expect(nextState.activeTabId).toBe("workspace:workspace_1");
  });

  test("reorders project tabs without changing the active tab", () => {
    const nextState = reorderProjectContentTabs(
      {
        activeTabId: "workspace:workspace_1",
        tabs: [
          createProjectViewTab("overview"),
          createWorkspaceTab("workspace_1"),
          createPullRequestTab(42),
        ],
      },
      "workspace:workspace_1",
      "pull-request:42",
      "after",
    );

    expect(nextState.tabs).toEqual([
      createProjectViewTab("overview"),
      createPullRequestTab(42),
      createWorkspaceTab("workspace_1"),
    ]);
    expect(nextState.activeTabId).toBe("workspace:workspace_1");
  });

  test("persists state per project", () => {
    const storage = createStorage();
    const state = focusPullRequestTab(
      focusWorkspaceTab(createDefaultProjectContentTabsState(), "workspace_7"),
      12,
    );

    writeProjectContentTabsState("project_1", state, storage);

    expect(readProjectContentTabsState("project_1", storage)).toEqual(state);
    expect(readProjectContentTabsState("project_2", storage)).toEqual(
      createDefaultProjectContentTabsState(),
    );
  });

  test("persists and clears the last selected project id", () => {
    const storage = createStorage();

    expect(readLastProjectId(storage)).toBeNull();

    writeLastProjectId("project_7", storage);
    expect(readLastProjectId(storage)).toBe("project_7");

    clearLastProjectId(storage);
    expect(readLastProjectId(storage)).toBeNull();
  });

  test("focuses project view tabs without duplicating overview", () => {
    const state = focusProjectViewTab(createDefaultProjectContentTabsState(), "overview");
    expect(state.tabs).toEqual([createProjectViewTab("overview")]);
    expect(state.activeTabId).toBe("view:overview");
  });

  test("keeps overview as the non-closeable root tab", () => {
    expect(canCloseProjectContentTab(createProjectViewTab("overview"))).toBeFalse();
    expect(
      resolveProjectContentTabIdToClose({
        activeTab: createProjectViewTab("overview"),
        activeWorkspaceSupportsCanvas: false,
      }),
    ).toBeNull();
  });

  test("resolves workspace and pull-request project tabs as closeable when the workspace canvas is not owning the shortcut", () => {
    expect(
      resolveProjectContentTabIdToClose({
        activeTab: createPullRequestTab(42),
        activeWorkspaceSupportsCanvas: false,
      }),
    ).toBe("pull-request:42");
    expect(
      resolveProjectContentTabIdToClose({
        activeTab: createWorkspaceTab("workspace_1"),
        activeWorkspaceSupportsCanvas: false,
      }),
    ).toBe("workspace:workspace_1");
  });

  test("defers workspace-tab close to the workspace canvas when an interactive pane surface is active", () => {
    expect(
      resolveProjectContentTabIdToClose({
        activeTab: createWorkspaceTab("workspace_1"),
        activeWorkspaceSupportsCanvas: true,
      }),
    ).toBeNull();
  });
});
