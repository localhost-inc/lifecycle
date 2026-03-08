import { describe, expect, test } from "bun:test";
import {
  createDefaultTerminalResponseReadyState,
  getResponseReadyWorkspaceIds,
  terminalResponseReadyReducer,
} from "./terminal-response-ready-provider";

describe("terminalResponseReadyReducer", () => {
  test("marks terminals as response-ready by workspace", () => {
    const state = terminalResponseReadyReducer(createDefaultTerminalResponseReadyState(), {
      completionKey: "codex:turn_1",
      terminalId: "terminal_1",
      type: "mark-ready",
      workspaceId: "workspace_1",
    });

    expect(state).toEqual({
      acknowledgedCompletionKeyByTerminalId: {},
      readyStateByTerminalId: {
        terminal_1: {
          completionKey: "codex:turn_1",
          workspaceId: "workspace_1",
        },
      },
    });
  });

  test("acknowledges a ready terminal without disturbing others", () => {
    const initialState = {
      acknowledgedCompletionKeyByTerminalId: {},
      readyStateByTerminalId: {
        terminal_1: {
          completionKey: "codex:turn_1",
          workspaceId: "workspace_1",
        },
        terminal_2: {
          completionKey: "claude:turn_2",
          workspaceId: "workspace_2",
        },
      },
    };

    expect(
      terminalResponseReadyReducer(initialState, {
        terminalId: "terminal_1",
        type: "acknowledge-terminal",
      }),
    ).toEqual({
      acknowledgedCompletionKeyByTerminalId: {
        terminal_1: "codex:turn_1",
      },
      readyStateByTerminalId: {
        terminal_2: {
          completionKey: "claude:turn_2",
          workspaceId: "workspace_2",
        },
      },
    });
  });

  test("ignores duplicate completion events for an acknowledged turn", () => {
    const acknowledgedState = terminalResponseReadyReducer(
      terminalResponseReadyReducer(createDefaultTerminalResponseReadyState(), {
        completionKey: "codex:turn_1",
        terminalId: "terminal_1",
        type: "mark-ready",
        workspaceId: "workspace_1",
      }),
      {
        terminalId: "terminal_1",
        type: "acknowledge-terminal",
      },
    );

    expect(
      terminalResponseReadyReducer(acknowledgedState, {
        completionKey: "codex:turn_1",
        terminalId: "terminal_1",
        type: "mark-ready",
        workspaceId: "workspace_1",
      }),
    ).toEqual(acknowledgedState);
  });

  test("marks a terminal ready again when a new turn completes", () => {
    const acknowledgedState = terminalResponseReadyReducer(
      terminalResponseReadyReducer(createDefaultTerminalResponseReadyState(), {
        completionKey: "codex:turn_1",
        terminalId: "terminal_1",
        type: "mark-ready",
        workspaceId: "workspace_1",
      }),
      {
        terminalId: "terminal_1",
        type: "acknowledge-terminal",
      },
    );

    expect(
      terminalResponseReadyReducer(acknowledgedState, {
        completionKey: "codex:turn_2",
        terminalId: "terminal_1",
        type: "mark-ready",
        workspaceId: "workspace_1",
      }),
    ).toEqual({
      acknowledgedCompletionKeyByTerminalId: {
        terminal_1: "codex:turn_1",
      },
      readyStateByTerminalId: {
        terminal_1: {
          completionKey: "codex:turn_2",
          workspaceId: "workspace_1",
        },
      },
    });
  });

  test("acknowledges all ready terminals for a workspace", () => {
    const initialState = {
      acknowledgedCompletionKeyByTerminalId: {},
      readyStateByTerminalId: {
        terminal_1: {
          completionKey: "codex:turn_1",
          workspaceId: "workspace_1",
        },
        terminal_2: {
          completionKey: "claude:turn_2",
          workspaceId: "workspace_1",
        },
        terminal_3: {
          completionKey: "codex:turn_3",
          workspaceId: "workspace_2",
        },
      },
    };

    expect(
      terminalResponseReadyReducer(initialState, {
        type: "acknowledge-workspace",
        workspaceId: "workspace_1",
      }),
    ).toEqual({
      acknowledgedCompletionKeyByTerminalId: {
        terminal_1: "codex:turn_1",
        terminal_2: "claude:turn_2",
      },
      readyStateByTerminalId: {
        terminal_3: {
          completionKey: "codex:turn_3",
          workspaceId: "workspace_2",
        },
      },
    });
  });
});

describe("getResponseReadyWorkspaceIds", () => {
  test("deduplicates workspaces when multiple terminals are ready", () => {
    expect(
      getResponseReadyWorkspaceIds({
        acknowledgedCompletionKeyByTerminalId: {},
        readyStateByTerminalId: {
          terminal_1: {
            completionKey: "codex:turn_1",
            workspaceId: "workspace_1",
          },
          terminal_2: {
            completionKey: "claude:turn_2",
            workspaceId: "workspace_1",
          },
          terminal_3: {
            completionKey: "codex:turn_3",
            workspaceId: "workspace_2",
          },
        },
      }),
    ).toEqual(["workspace_1", "workspace_2"]);
  });
});
