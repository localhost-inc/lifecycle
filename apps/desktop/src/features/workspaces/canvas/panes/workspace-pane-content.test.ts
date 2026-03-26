import { describe, expect, test } from "bun:test";
import { areWorkspaceMountedSurfacePropsEqual } from "@/features/workspaces/canvas/panes/workspace-pane-content";

describe("areWorkspaceMountedSurfacePropsEqual", () => {
  function createProps() {
    const launchActions: [] = [];
    const onFileEditorSessionStateChange = () => {};
    const onLaunchSurface = () => {};
    const onOpenFile = () => {};
    const onTabViewStateChange = () => {};

    return {
      isActive: false,
      launchActions,
      onFileEditorSessionStateChange,
      onLaunchSurface,
      onOpenFile,
      onTabViewStateChange,
      paneFocused: true,
      panelId: "tab-panel-file:README.md",
      surface: {
        kind: "agent" as const,
        tab: {
          agentSessionId: "session-1",
          key: "agent:session-1",
          kind: "agent" as const,
          label: "Codex",
          provider: "codex" as const,
        },
        viewState: null,
        workspaceId: "workspace-1",
      },
      surfaceKey: "agent:session-1",
      surfaceOpacity: 1,
      tabDomId: "tab-agent-session-1",
    };
  }

  test("treats hidden surface props as equal when only parent object churn occurs", () => {
    const previous = createProps();
    const next = {
      ...previous,
      surface: {
        ...previous.surface,
      },
    };

    expect(areWorkspaceMountedSurfacePropsEqual(previous, next)).toBe(true);
  });

  test("detects visibility flips for the mounted surface wrapper", () => {
    const previous = createProps();
    const next = {
      ...previous,
      isActive: true,
    };

    expect(areWorkspaceMountedSurfacePropsEqual(previous, next)).toBe(false);
  });

  test("detects real surface model changes while hidden", () => {
    const previous = createProps();
    const next = {
      ...previous,
      surface: {
        ...previous.surface,
        viewState: {
          stickToBottom: true as const,
        },
      },
    };

    expect(areWorkspaceMountedSurfacePropsEqual(previous, next)).toBe(false);
  });
});
