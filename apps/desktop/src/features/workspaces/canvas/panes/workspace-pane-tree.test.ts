import { afterEach, describe, expect, test } from "bun:test";
import {
  areWorkspacePaneLeafPropsEqual,
  resolveWorkspacePaneOpacity,
  shouldAutoSelectWorkspacePaneFromPointerTarget,
} from "@/features/workspaces/canvas/panes/workspace-pane-tree";

const originalElement = globalThis.Element;

afterEach(() => {
  if (originalElement === undefined) {
    delete (globalThis as { Element?: typeof Element }).Element;
    return;
  }

  (globalThis as { Element: typeof Element }).Element = originalElement;
});

describe("shouldAutoSelectWorkspacePaneFromPointerTarget", () => {
  test("does not auto-select a pane when the pointer starts on an interactive control", () => {
    class FakeElement {
      closest(selector: string) {
        return selector.includes("[data-tab-action]") ? this : null;
      }
    }

    (globalThis as { Element?: typeof Element }).Element = FakeElement as unknown as typeof Element;

    expect(
      shouldAutoSelectWorkspacePaneFromPointerTarget(new FakeElement() as unknown as EventTarget),
    ).toBe(false);
  });

  test("auto-selects a pane for null or non-control targets", () => {
    class FakeElement {
      closest() {
        return null;
      }
    }

    (globalThis as { Element?: typeof Element }).Element = FakeElement as unknown as typeof Element;

    expect(
      shouldAutoSelectWorkspacePaneFromPointerTarget(new FakeElement() as unknown as EventTarget),
    ).toBe(true);
    expect(shouldAutoSelectWorkspacePaneFromPointerTarget(null)).toBe(true);
  });
});

describe("resolveWorkspacePaneOpacity", () => {
  test("dims only inactive panes that are not hovered", () => {
    expect(
      resolveWorkspacePaneOpacity({
        dimInactivePanes: true,
        inactivePaneOpacity: 0.45,
        isActivePane: false,
        isHoveredPane: false,
      }),
    ).toBe(0.45);
  });

  test("keeps active panes at full opacity", () => {
    expect(
      resolveWorkspacePaneOpacity({
        dimInactivePanes: true,
        inactivePaneOpacity: 0.45,
        isActivePane: true,
        isHoveredPane: false,
      }),
    ).toBe(1);
  });

  test("hovered inactive panes split the difference between dim and full opacity", () => {
    expect(
      resolveWorkspacePaneOpacity({
        dimInactivePanes: true,
        inactivePaneOpacity: 0.45,
        isActivePane: false,
        isHoveredPane: true,
      }),
    ).toBe(0.725);
  });

  test("does not dim when the feature is disabled", () => {
    expect(
      resolveWorkspacePaneOpacity({
        dimInactivePanes: false,
        inactivePaneOpacity: 0.45,
        isActivePane: false,
        isHoveredPane: false,
      }),
    ).toBe(1);
  });
});

describe("areWorkspacePaneLeafPropsEqual", () => {
  function createLeafProps() {
    const actions = {
      closeTab: () => {},
      fileSessionStateChange: () => {},
      launchSurface: () => {},
      moveTabToPane: () => {},
      openFile: () => {},
      reconcilePaneVisibleTabOrder: () => {},
      resetAllSplitRatios: () => {},
      selectPane: () => {},
      selectTab: () => {},
      setSplitRatio: () => {},
      splitPane: () => {},
      tabViewStateChange: () => {},
      toggleZoom: () => {},
    };

    return {
      actions,
      dimInactivePanes: false,
      inactivePaneOpacity: 0.65,
      isBodyDropTarget: false,
      isZoomedView: false,
      onTabDrag: () => {},
      onTabDragCommit: () => {},
      pane: {
        activeSurface: {
          tab: {
            extension: "tsx",
            filePath: "src/app.tsx",
            key: "file:src/app.tsx",
            kind: "file-viewer" as const,
            label: "app.tsx",
          },
          kind: "file-viewer" as const,
          sessionState: null,
          viewState: { scrollTop: 24 },
          workspaceId: "workspace-1",
        },
        id: "pane-left",
        isActive: true,
        tabBar: {
          activeTabKey: "file:src/app.tsx",
          dragPreview: null,
          paneId: "pane-left",
          tabs: [
            {
              isDirty: true,
              isRunning: false,
              key: "file:src/app.tsx",
              label: "app.tsx",
              leading: null,
              needsAttention: false,
              tab: {
                extension: "tsx",
                filePath: "src/app.tsx",
                key: "file:src/app.tsx",
                kind: "file-viewer" as const,
                label: "app.tsx",
              },
              title: "src/app.tsx",
            },
          ],
        },
        tabSurfaces: [
          {
            key: "file:src/app.tsx",
            surface: {
              tab: {
                extension: "tsx",
                filePath: "src/app.tsx",
                key: "file:src/app.tsx",
                kind: "file-viewer" as const,
                label: "app.tsx",
              },
              kind: "file-viewer" as const,
              sessionState: null,
              viewState: { scrollTop: 24 },
              workspaceId: "workspace-1",
            },
          },
        ],
      },
      paneCount: 2,
      paneTabDragInProgress: false,
      setPaneElement: () => {},
      surfaceActions: [],
    };
  }

  test("treats unrelated pane-model object churn as equal when pane state is unchanged", () => {
    const previous = createLeafProps();
    const next = {
      ...previous,
      pane: {
        ...previous.pane,
        tabBar: {
          ...previous.pane.tabBar,
          tabs: [...previous.pane.tabBar.tabs],
        },
      },
    };

    expect(areWorkspacePaneLeafPropsEqual(previous, next)).toBe(true);
  });

  test("detects changes to the active pane session state", () => {
    const previous = createLeafProps();
    const next = {
      ...previous,
      pane: {
        ...previous.pane,
        activeSurface: {
          ...previous.pane.activeSurface,
          kind: "file-viewer" as const,
          sessionState: {
            conflictDiskContent: null,
            draftContent: "next draft",
            savedContent: "saved",
          },
        },
      },
    };

    expect(areWorkspacePaneLeafPropsEqual(previous, next)).toBe(false);
  });
});
