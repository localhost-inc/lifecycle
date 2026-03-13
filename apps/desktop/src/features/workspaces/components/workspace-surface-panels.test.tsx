import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createChangesDiffTab } from "../state/workspace-surface-state";

describe("WorkspaceSurfacePanels", () => {
  afterEach(() => {
    mock.restore();
  });

  test("passes file-open handlers through git diff surfaces", async () => {
    const gitDiffSurfaceModule = await import("../../git/components/git-diff-surface");
    const onOpenFile = mock((_filePath: string) => {});
    let capturedOnOpenFile: ((filePath: string) => void) | undefined;

    spyOn(gitDiffSurfaceModule, "GitDiffSurface").mockImplementation(((
      props: Parameters<typeof gitDiffSurfaceModule.GitDiffSurface>[0],
    ) => {
      capturedOnOpenFile = props.onOpenFile ?? undefined;
      return createElement("div", { "data-slot": "git-diff-surface" }, "Git diff");
    }) as never);

    const { WorkspaceSurfacePanels } = await import("./workspace-surface-panels");
    const changesTab = createChangesDiffTab("src/app.tsx");

    renderToStaticMarkup(
      createElement(WorkspaceSurfacePanels, {
        activeTabKey: changesTab.key,
        activeFileSessionState: null,
        activeTerminalId: null,
        activeTabViewState: null,
        activity: [],
        creatingSelection: null,
        documents: [changesTab],
        hasVisibleTabs: true,
        onCreateTerminal: async () => {},
        onFileSessionStateChange: () => {},
        onOpenFile,
        onOpenTerminal: () => {},
        paneDragInProgress: false,
        paneFocused: true,
        onTabViewStateChange: () => {},
        sessionHistory: [],
        terminals: [],
        waitingForActiveRuntimeTab: false,
        workspaceId: "workspace-1",
      }),
    );

    expect(typeof capturedOnOpenFile).toBe("function");
    capturedOnOpenFile?.("README.md");
    expect(onOpenFile).toHaveBeenCalledWith("README.md");
  });

  test("keeps the tabpanel stretched to the full pane height for terminal surfaces", async () => {
    const terminalSurfaceModule = await import("../../terminals/components/terminal-surface");

    spyOn(terminalSurfaceModule, "TerminalSurface").mockImplementation((() =>
      createElement("div", { "data-slot": "terminal-surface" }, "Terminal")) as never);

    const { WorkspaceSurfacePanels } = await import("./workspace-surface-panels");
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSurfacePanels, {
        activeTabKey: "terminal:term-1",
        activeFileSessionState: null,
        activeTerminalId: "term-1",
        activeTabViewState: null,
        activity: [],
        creatingSelection: null,
        documents: [],
        hasVisibleTabs: true,
        onCreateTerminal: async () => {},
        onFileSessionStateChange: () => {},
        onOpenFile: () => {},
        onOpenTerminal: () => {},
        onTabViewStateChange: () => {},
        paneDragInProgress: false,
        paneFocused: true,
        sessionHistory: [],
        terminals: [
          {
            created_by: null,
            ended_at: null,
            exit_code: null,
            failure_reason: null,
            harness_provider: null,
            harness_session_id: null,
            id: "term-1",
            label: "Shell 1",
            last_active_at: "2026-03-12T00:00:00.000Z",
            launch_type: "shell",
            started_at: "2026-03-12T00:00:00.000Z",
            status: "detached",
            workspace_id: "workspace-1",
          },
        ],
        waitingForActiveRuntimeTab: false,
        workspaceId: "workspace-1",
      }),
    );

    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('class="flex h-full min-h-0 flex-1 flex-col"');
    expect(markup).toContain('data-slot="terminal-surface"');
  });
});
