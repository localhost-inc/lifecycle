import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createAgentTab,
  createBrowserTab,
  createChangesDiffTab,
  terminalTabKey,
} from "@/features/workspaces/state/workspace-canvas-state";

describe("WorkspacePaneContent", () => {
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

    const { WorkspacePaneContent } = await import("./workspace-pane-content");
    const changesTab = createChangesDiffTab("src/app.tsx");

    renderToStaticMarkup(
      createElement(WorkspacePaneContent, {
        activeTabKey: changesTab.key,
        activeFileSessionState: null,
        activeTabViewState: null,
        creatingSelection: null,
        documents: [changesTab],
        hasVisibleTabs: true,
        onFileSessionStateChange: () => {},
        onLaunchSurface: () => {},
        onOpenFile,
        paneDragInProgress: false,
        paneFocused: true,
        onTabViewStateChange: () => {},
        surfaceOpacity: 1,
        terminals: [],
        waitingForSelectedTerminalTab: false,
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

    const { WorkspacePaneContent } = await import("./workspace-pane-content");
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneContent, {
        activeTabKey: terminalTabKey("term-1"),
        activeFileSessionState: null,
        activeTabViewState: null,
        creatingSelection: null,
        documents: [],
        hasVisibleTabs: true,
        onFileSessionStateChange: () => {},
        onLaunchSurface: () => {},
        onOpenFile: () => {},
        onTabViewStateChange: () => {},
        paneDragInProgress: false,
        paneFocused: true,
        surfaceOpacity: 1,
        terminals: [
          {
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
        ],
        waitingForSelectedTerminalTab: false,
        workspaceId: "workspace-1",
      }),
    );

    expect(markup).toContain('role="tabpanel"');
    expect(markup).toContain('class="flex h-full min-h-0 flex-1 flex-col"');
    expect(markup).toContain('data-slot="terminal-surface"');
  });

  test("renders empty-pane quick actions when no tabs are visible", async () => {
    const { WorkspacePaneContent } = await import("./workspace-pane-content");
    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneContent, {
        activeTabKey: null,
        activeFileSessionState: null,
        activeTabViewState: null,
        creatingSelection: null,
        documents: [],
        hasVisibleTabs: false,
        onFileSessionStateChange: () => {},
        onLaunchSurface: () => {},
        onOpenFile: () => {},
        onTabViewStateChange: () => {},
        paneDragInProgress: false,
        paneFocused: true,
        surfaceOpacity: 1,
        terminals: [],
        waitingForSelectedTerminalTab: false,
        workspaceId: "workspace-1",
      }),
    );

    expect(markup).toContain("No open tabs");
    expect(markup).toContain("Shell");
    expect(markup).toContain("Claude");
    expect(markup).toContain("Codex");
  });

  test("renders the browser surface for browser documents", async () => {
    const browserSurfaceModule = await import("./browser-surface");

    spyOn(browserSurfaceModule, "BrowserSurface").mockImplementation(((
      props: Parameters<typeof browserSurfaceModule.BrowserSurface>[0],
    ) =>
      createElement(
        "div",
        {
          "data-slot": "browser-surface",
          "data-tab-key": props.tabKey,
          "data-url": props.url,
        },
        props.title,
      )) as never);

    const { WorkspacePaneContent } = await import("./workspace-pane-content");
    const browserTab = createBrowserTab({
      key: "service:web",
      label: "web",
      url: "http://web.sydney.lifecycle.localhost",
    });

    const markup = renderToStaticMarkup(
      createElement(WorkspacePaneContent, {
        activeTabKey: browserTab.key,
        activeFileSessionState: null,
        activeTabViewState: null,
        creatingSelection: null,
        documents: [browserTab],
        hasVisibleTabs: true,
        onFileSessionStateChange: () => {},
        onLaunchSurface: () => {},
        onOpenFile: () => {},
        onTabViewStateChange: () => {},
        paneDragInProgress: false,
        paneFocused: true,
        surfaceOpacity: 1,
        terminals: [],
        waitingForSelectedTerminalTab: false,
        workspaceId: "workspace-1",
      }),
    );

    expect(markup).toContain('data-slot="browser-surface"');
    expect(markup).toContain('data-tab-key="browser:service:web"');
    expect(markup).toContain('data-url="http://web.sydney.lifecycle.localhost"');
  });

  test("renders the agent surface for agent tabs", async () => {
    const agentSurfaceModule = await import("../../agents/components/agent-surface");

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
      createElement(WorkspacePaneContent, {
        activeTabKey: agentTab.key,
        activeFileSessionState: null,
        activeTabViewState: null,
        creatingSelection: null,
        documents: [agentTab],
        hasVisibleTabs: true,
        onFileSessionStateChange: () => {},
        onLaunchSurface: () => {},
        onOpenFile: () => {},
        onTabViewStateChange: () => {},
        paneDragInProgress: false,
        paneFocused: true,
        surfaceOpacity: 1,
        terminals: [],
        waitingForSelectedTerminalTab: false,
        workspaceId: "workspace-1",
      }),
    );

    expect(markup).toContain('data-slot="agent-surface"');
    expect(markup).toContain('data-agent-session-id="agent_session_1"');
  });

  test("threads pane opacity into native terminal surfaces", async () => {
    const terminalSurfaceModule = await import("../../terminals/components/terminal-surface");
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
        activeTabKey: terminalTabKey("term-1"),
        activeFileSessionState: null,
        activeTabViewState: null,
        creatingSelection: null,
        documents: [],
        hasVisibleTabs: true,
        onFileSessionStateChange: () => {},
        onLaunchSurface: () => {},
        onOpenFile: () => {},
        onTabViewStateChange: () => {},
        paneDragInProgress: false,
        paneFocused: false,
        surfaceOpacity: 0.45,
        terminals: [
          {
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
        ],
        waitingForSelectedTerminalTab: false,
        workspaceId: "workspace-1",
      }),
    );

    expect(capturedOpacity).toBe(0.45);
  });
});
