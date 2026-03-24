import { describe, expect, mock, test } from "bun:test";
import {
  createFileViewerTab,
  terminalTabKey,
} from "@/features/workspaces/state/workspace-canvas-state";
import { closeWorkspacePaneTabs } from "@/features/workspaces/canvas/panes/workspace-pane-close";

describe("closeWorkspacePaneTabs", () => {
  test("collapses empty panes without trying to close tabs", async () => {
    const collapseEmptyPane = mock(() => {});
    const closeDocumentTab = mock((_tabKey: string) => true);
    const closeTerminalTab = mock(async (_tabKey: string, _terminalId: string) => true);

    await expect(
      closeWorkspacePaneTabs([], {
        collapseEmptyPane,
        closeDocumentTab,
        closeTerminalTab,
      }),
    ).resolves.toBe(true);

    expect(collapseEmptyPane).not.toHaveBeenCalled();
    expect(closeDocumentTab).not.toHaveBeenCalled();
    expect(closeTerminalTab).not.toHaveBeenCalled();
  });

  test("closes every tab in a populated pane", async () => {
    const calls: Array<
      | { kind: "document"; tabKey: string }
      | { kind: "terminal"; tabKey: string; terminalId: string }
      | { kind: "collapse" }
    > = [];

    await expect(
      closeWorkspacePaneTabs(
        [
          {
            key: terminalTabKey("term-1"),
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
            calls.push({ kind: "collapse" });
          },
          closeDocumentTab: (tabKey) => {
            calls.push({ kind: "document", tabKey });
            return true;
          },
          closeTerminalTab: async (tabKey, terminalId) => {
            calls.push({ kind: "terminal", tabKey, terminalId });
            return true;
          },
        },
      ),
    ).resolves.toBe(true);

    expect(calls).toEqual([
      { kind: "terminal", tabKey: terminalTabKey("term-1"), terminalId: "term-1" },
      { kind: "document", tabKey: "file:README.md" },
    ]);
  });

  test("stops once a pane tab refuses to close", async () => {
    const calls: Array<
      | { kind: "document"; tabKey: string }
      | { kind: "terminal"; tabKey: string; terminalId: string }
      | { kind: "collapse" }
    > = [];

    await expect(
      closeWorkspacePaneTabs(
        [createFileViewerTab("README.md"), createFileViewerTab("docs/plans/agent-workspace.md")],
        {
          collapseEmptyPane: () => {
            calls.push({ kind: "collapse" });
          },
          closeDocumentTab: (tabKey) => {
            calls.push({ kind: "document", tabKey });
            return false;
          },
          closeTerminalTab: async (tabKey, terminalId) => {
            calls.push({ kind: "terminal", tabKey, terminalId });
            return true;
          },
        },
      ),
    ).resolves.toBe(false);

    expect(calls).toEqual([{ kind: "document", tabKey: "file:README.md" }]);
  });
});
