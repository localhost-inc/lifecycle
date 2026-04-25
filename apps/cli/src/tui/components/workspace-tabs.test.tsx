import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WorkspaceExtensionSidebar } from "./workspace-extension-sidebar";
import { WorkspaceSessionStrip } from "./workspace-session-strip";
import { defaultTuiTheme } from "../tui-theme";
import { attachTerminalActivity } from "../tui-models";

describe("workspace tabs", () => {
  test("renders the active workspace tab as a highlighted pill", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSessionStrip, {
        activeTerminalId: "term_active",
        focus: "canvas",
        onCreateTerminal: () => {},
        onTerminalPress: () => {},
        terminals: [
          { busy: false, id: "term_active", kind: "shell", title: "zsh" },
          { busy: false, id: "term_other", kind: "shell", title: "logs" },
        ],
        theme: defaultTuiTheme,
      }),
    );

    const highlightedPillCount =
      markup.split(`background-color:${defaultTuiTheme.surfaceSelected}`).length - 1;

    expect(markup).toContain("zsh");
    expect(highlightedPillCount).toBe(1);
  });

  test("renders explicit terminal activity in the session strip", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceSessionStrip, {
        activeTerminalId: "term_agent",
        focus: "canvas",
        onCreateTerminal: () => {},
        onTerminalPress: () => {},
        terminals: [
          {
            activity: {
              busy: true,
              last_event_at: "2026-04-25T12:00:00.000Z",
              metadata: null,
              provider: "opencode",
              prompt: null,
              source: "explicit",
              state: "waiting",
              terminal_id: "term_agent",
              title: null,
              tool_name: null,
              turn_id: "turn_1",
              updated_at: "2026-04-25T12:00:00.000Z",
              waiting_kind: "approval",
            },
            busy: false,
            id: "term_agent",
            kind: "custom",
            title: "opencode",
          },
        ],
        theme: defaultTuiTheme,
      }),
    );

    expect(markup).toContain("* opencode waiting");
  });

  test("keeps explicit websocket activity when the terminal snapshot has not caught up", () => {
    const terminals = attachTerminalActivity([], {
      busy: true,
      terminals: [
        {
          busy: true,
          last_event_at: "2026-04-25T12:00:00.000Z",
          metadata: null,
          provider: "opencode",
          prompt: null,
          source: "explicit",
          state: "turn_active",
          terminal_id: "@agent",
          title: null,
          tool_name: null,
          turn_id: "turn_1",
          updated_at: "2026-04-25T12:00:00.000Z",
          waiting_kind: null,
        },
      ],
      updated_at: "2026-04-25T12:00:00.000Z",
      workspace_id: "ws_1",
    });

    const markup = renderToStaticMarkup(
      createElement(WorkspaceSessionStrip, {
        activeTerminalId: "@agent",
        focus: "canvas",
        onCreateTerminal: () => {},
        onTerminalPress: () => {},
        terminals,
        theme: defaultTuiTheme,
      }),
    );

    expect(terminals).toEqual([
      expect.objectContaining({
        busy: true,
        id: "@agent",
        kind: "opencode",
        title: "opencode",
      }),
    ]);
    expect(markup).toContain("* opencode turn");
  });

  test("renders terminal activity in the debug sidebar", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceExtensionSidebar, {
        detail: null,
        focus: "extensions",
        onSelectExtension: () => {},
        selectedExtension: "debug",
        terminals: [
          {
            activity: {
              busy: true,
              last_event_at: "2026-04-25T12:00:00.000Z",
              metadata: null,
              provider: "codex",
              prompt: null,
              source: "explicit",
              state: "tool_active",
              terminal_id: "term_agent",
              title: null,
              tool_name: "Bash",
              turn_id: "turn_1",
              updated_at: "2026-04-25T12:00:00.000Z",
              waiting_kind: null,
            },
            busy: false,
            id: "term_agent",
            kind: "codex",
            title: "codex",
          },
        ],
        terminalsEnvelope: null,
        theme: defaultTuiTheme,
        width: 30,
        workspacePath: "/workspace",
      }),
    );

    expect(markup).toContain("* codex · codex · tool_active:Bash");
  });

  test("renders the selected extension tab as a highlighted pill", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceExtensionSidebar, {
        detail: null,
        focus: "extensions",
        onSelectExtension: () => {},
        selectedExtension: "debug",
        terminals: [],
        terminalsEnvelope: {
          runtime: {
            backend_label: "tmux",
            launch_error: null,
            persistent: true,
            runtime_id: "runtime_1",
            supports_close: false,
            supports_connect: true,
            supports_create: true,
            supports_rename: false,
          },
          terminals: [],
          workspace: {
            binding: "bound",
            cwd: "/workspace",
            host: "local",
            repo_name: "lifecycle",
            resolution_error: null,
            resolution_note: null,
            source_ref: "main",
            status: "running",
            workspace_id: "ws_1",
            workspace_name: "main",
            workspace_root: "/workspace",
          },
        },
        theme: defaultTuiTheme,
        width: 30,
        workspacePath: "/workspace",
      }),
    );

    const highlightedPillCount =
      markup.split(`background-color:${defaultTuiTheme.surfaceSelected}`).length - 1;

    expect(markup).toContain("Debug");
    expect(highlightedPillCount).toBe(1);
  });

  test("renders stack services as a single line with a status dot and right-aligned link icons", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkspaceExtensionSidebar, {
        detail: {
          stack: {
            errors: [],
            nodes: [
              {
                kind: "process",
                name: "web",
                preview_url: "https://preview.lifecycle.test",
                status: "running",
              },
            ],
            state: "idle",
            workspace_id: "ws_1",
          },
          workspace: {} as never,
        },
        focus: "extensions",
        onSelectExtension: () => {},
        selectedExtension: "stack",
        terminals: [],
        terminalsEnvelope: null,
        theme: defaultTuiTheme,
        width: 30,
        workspacePath: "/workspace",
      }),
    );

    expect(markup).toContain(
      '>●</text><text fg="#faf8f5"> web</text><box style="flex-grow:1"></box><text fg="#60a5fa">↗</text>',
    );
    expect(markup).not.toContain("https://preview.lifecycle.test");
    expect(markup).not.toContain("process");
  });
});
