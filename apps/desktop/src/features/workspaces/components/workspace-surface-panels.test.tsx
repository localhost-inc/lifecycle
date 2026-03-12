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
        activeTerminalId: null,
        activeTabViewState: null,
        activity: [],
        creatingSelection: null,
        documents: [changesTab],
        hasVisibleTabs: true,
        onCreateTerminal: async () => {},
        onOpenFile,
        onOpenTerminal: () => {},
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
});
