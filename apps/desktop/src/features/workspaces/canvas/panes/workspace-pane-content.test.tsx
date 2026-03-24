import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createAgentTab,
  createChangesDiffTab,
  createPreviewTab,
  terminalTabKey,
} from "@/features/workspaces/state/workspace-canvas-state";
import type { WorkspacePaneActiveSurfaceModel } from "@/features/workspaces/canvas/workspace-pane-models";

function createProps(activeSurface: WorkspacePaneActiveSurfaceModel) {
  return {
    activeSurface,
    onFileSessionStateChange: () => {},
    onLaunchSurface: () => {},
    onOpenFile: () => {},
    onTabViewStateChange: () => {},
    paneDragInProgress: false,
    paneFocused: true,
    surfaceOpacity: 1,
  };
}

describe("WorkspacePaneContent", () => {
  afterEach(() => {
    mock.restore();
  });

  test("passes file-open handlers through git diff surfaces", async () => {
    const gitDiffSurfaceModule = await import("../../../git/components/git-diff-surface");
    const onOpenFile = mock((_filePath: string) => {});
    let capturedOnOpenFile: ((filePath: string) => void) | undefined;

    spyOn(gitDiffSurfaceModule, "GitDiffSurface").mockImplementation(((
      props: Parameters<typeof gitDiffSurfaceModule.GitDiffSurface>[0],
    ) => {
      capturedOnOpenFile = props.onOpenFile ?? undefined;
      return createElement("div", { "data-slot": "git-diff-surface" }, "Git diff");
    }) as never);

    const { WorkspacePaneContent } = await import("./workspace-pane-content");
    const changesTab = createChangesDiffTab("src/app.tsx");

    renderToStaticMarkup(
      createElement(WorkspacePaneContent, {
        ...createProps({
          document: changesTab,
          kind: "changes-diff",
          viewState: null,
          workspaceId: "workspace-1",
        }),
        onOpenFile,
      }),
    );

    expect(typeof capturedOnOpenFile).toBe("function");
    capturedOnOpenFile?.("README.md");
    expect(onOpenFile).toHaveBeenCalledWith("README.md");
  });

  test("keeps the tabpanel stretched to the full pane height for terminal surfaces", async () => {
    const terminalSurfaceModule = await import("../../../terminals/components/terminal-surface");

    spyOn(terminalSurfaceModule, "TerminalSurface").mockImplementation((() =>
      createElement("div", { "data-slot": "terminal-surface" }, "Terminal")) as never);

    const { WorkspacePaneContent } = await import("./workspace-pane-content");
    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneContent,
        createProps({
          kind: "terminal",
          tab: {
            key: terminalTabKey("term-1"),
            kind: "terminal",
            label: "Shell 1",
            launchType: "shell",
            responseReady: false,
            status: "detached",
            terminalId: "term-1",
          },
          terminal: {
            created_by: null,
            ended_at: null,
            exit_code: null,
            failure_reason: null,
            id: "term-1",
            label: "Shell 1",
            last_active_at: "2026-03-12T00:00:00.000Z",
            launch_type: "shell",
            started_at: "2026-03-12T00:00:00.000Z",
            status: "detached",
            workspace_id: "workspace-1",
          },
        }),
      ),
    );

    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('class="flex h-full min-h-0 flex-1 flex-col"');
    expect(markup).toContain('data-slot="terminal-surface"');
  });

  test("renders empty-pane quick actions when the surface is a launcher", async () => {
    const { WorkspacePaneContent } = await import("./workspace-pane-content");
    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneContent,
        createProps({
          creatingSelection: null,
          kind: "launcher",
        }),
      ),
    );

    expect(markup).toContain("No open tabs");
    expect(markup).toContain("Shell");
    expect(markup).toContain("Claude");
    expect(markup).toContain("Codex");
  });

  test("renders the preview surface for preview documents", async () => {
    const previewSurfaceModule = await import("../../surfaces/preview-surface");

    spyOn(previewSurfaceModule, "PreviewSurface").mockImplementation(((
      props: Parameters<typeof previewSurfaceModule.PreviewSurface>[0],
    ) =>
      createElement(
        "div",
        {
          "data-slot": "preview-surface",
          "data-tab-key": props.tabKey,
          "data-url": props.url,
        },
        props.title,
      )) as never);

    const { WorkspacePaneContent } = await import("./workspace-pane-content");
    const previewTab = createPreviewTab({
      key: "service:web",
      label: "web",
      url: "http://web.sydney.lifecycle.localhost",
    });

    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneContent,
        createProps({
          document: previewTab,
          kind: "preview",
        }),
      ),
    );

    expect(markup).toContain('data-slot="preview-surface"');
    expect(markup).toContain('data-tab-key="preview:service:web"');
    expect(markup).toContain('data-url="http://web.sydney.lifecycle.localhost"');
  });

  test("renders the agent surface for agent tabs", async () => {
    const agentSurfaceModule = await import("../../../agents/components/agent-surface");

    spyOn(agentSurfaceModule, "AgentSurface").mockImplementation(((
      props: Parameters<typeof agentSurfaceModule.AgentSurface>[0],
    ) =>
      createElement(
        "div",
        {
          "data-agent-session-id": props.agentSessionId,
          "data-slot": "agent-surface",
        },
        props.workspaceId,
      )) as never);

    const { WorkspacePaneContent } = await import("./workspace-pane-content");
    const agentTab = createAgentTab({
      agentSessionId: "agent_session_1",
      provider: "claude",
      label: "Claude",
    });

    const markup = renderToStaticMarkup(
      createElement(
        WorkspacePaneContent,
        createProps({
          document: agentTab,
          kind: "agent",
          workspaceId: "workspace-1",
        }),
      ),
    );

    expect(markup).toContain('data-slot="agent-surface"');
    expect(markup).toContain('data-agent-session-id="agent_session_1"');
  });

  test("threads pane opacity into native terminal surfaces", async () => {
    const terminalSurfaceModule = await import("../../../terminals/components/terminal-surface");
    let capturedOpacity = Number.NaN;

    spyOn(terminalSurfaceModule, "TerminalSurface").mockImplementation(((
      props: Parameters<typeof terminalSurfaceModule.TerminalSurface>[0],
    ) => {
      capturedOpacity = props.opacity;
      return createElement("div", { "data-slot": "terminal-surface" }, "Terminal");
    }) as never);

    const { WorkspacePaneContent } = await import("./workspace-pane-content");

    renderToStaticMarkup(
      createElement(WorkspacePaneContent, {
        ...createProps({
          kind: "terminal",
          tab: {
            key: terminalTabKey("term-1"),
            kind: "terminal",
            label: "Shell 1",
            launchType: "shell",
            responseReady: false,
            status: "detached",
            terminalId: "term-1",
          },
          terminal: {
            created_by: null,
            ended_at: null,
            exit_code: null,
            failure_reason: null,
            id: "term-1",
            label: "Shell 1",
            last_active_at: "2026-03-12T00:00:00.000Z",
            launch_type: "shell",
            started_at: "2026-03-12T00:00:00.000Z",
            status: "detached",
            workspace_id: "workspace-1",
          },
        }),
        paneFocused: false,
        surfaceOpacity: 0.45,
      }),
    );

    expect(capturedOpacity).toBe(0.45);
  });
});
