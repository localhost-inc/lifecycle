import { describe, expect, mock, test } from "bun:test";
import { createFileViewerTab } from "../state/workspace-canvas-state";
import { closeWorkspacePaneTabs } from "./workspace-pane-close";

describe("closeWorkspacePaneTabs", () => {
  test("collapses empty panes without trying to close tabs", async () => {
    const collapseEmptyPane = mock(() => {});
    const closeDocumentTab = mock((_tabKey: string) => true);
    const closeRuntimeTab = mock(async (_tabKey: string, _terminalId: string) => true);

    await expect(
      closeWorkspacePaneTabs([], {
        collapseEmptyPane,
        closeDocumentTab,
        closeRuntimeTab,
      }),
    ).resolves.toBe(true);

    expect(collapseEmptyPane).not.toHaveBeenCalled();
    expect(closeDocumentTab).not.toHaveBeenCalled();
    expect(closeRuntimeTab).not.toHaveBeenCalled();
  });

  test("closes every tab in a populated pane", async () => {
    const calls: string[] = [];

    await expect(
      closeWorkspacePaneTabs(
        [
          {
            harnessProvider: null,
            key: "terminal:term-1",
            kind: "terminal",
            label: "Shell",
            launchType: "shell",
            responseReady: false,
            running: false,
            status: "active",
            terminalId: "term-1",
          },
          createFileViewerTab("README.md"),
        ],
        {
          collapseEmptyPane: () => {
            calls.push("collapse");
          },
          closeDocumentTab: (tabKey) => {
            calls.push(`document:${tabKey}`);
            return true;
          },
          closeRuntimeTab: async (tabKey, terminalId) => {
            calls.push(`runtime:${tabKey}:${terminalId}`);
            return true;
          },
        },
      ),
    ).resolves.toBe(true);

    expect(calls).toEqual([
      "runtime:terminal:term-1:term-1",
      "document:file:README.md",
    ]);
  });

  test("stops once a pane tab refuses to close", async () => {
    const calls: string[] = [];

    await expect(
      closeWorkspacePaneTabs(
        [createFileViewerTab("README.md"), createFileViewerTab("docs/plan.md")],
        {
          collapseEmptyPane: () => {
            calls.push("collapse");
          },
          closeDocumentTab: (tabKey) => {
            calls.push(`document:${tabKey}`);
            return false;
          },
          closeRuntimeTab: async (tabKey, terminalId) => {
            calls.push(`runtime:${tabKey}:${terminalId}`);
            return true;
          },
        },
      ),
    ).resolves.toBe(false);

    expect(calls).toEqual(["document:file:README.md"]);
  });
});
