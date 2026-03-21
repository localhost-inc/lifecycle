import { describe, expect, test } from "bun:test";
import {
  createDefaultTerminalResponseReadyState,
  getResponseReadyWorkspaceIds,
  getRunningWorkspaceIds,
  terminalResponseReadyReducer,
} from "@/features/terminals/state/terminal-response-ready-provider";

describe("terminalResponseReadyReducer", () => {
  test("marks terminals as response-ready by workspace", () => {
    const state = terminalResponseReadyReducer(createDefaultTerminalResponseReadyState(), {
      completionKey: "codex:turn_1",
      terminalId: "terminal_1",
      kind: "mark-ready",
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
      runningStateByTerminalId: {},
    });
  });

  test("marks harness turns as running until completion", () => {
    const runningState = terminalResponseReadyReducer(createDefaultTerminalResponseReadyState(), {
      terminalId: "terminal_1",
      turnId: "turn_1",
      kind: "mark-running",
      workspaceId: "workspace_1",
    });

    expect(runningState.runningStateByTerminalId).toEqual({
      terminal_1: {
        turnId: "turn_1",
        workspaceId: "workspace_1",
      },
    });

    expect(
      terminalResponseReadyReducer(runningState, {
        terminalId: "terminal_1",
        kind: "clear-running-terminal",
      }).runningStateByTerminalId,
    ).toEqual({});
  });

  test("does not replace a known running turn id with a later null turn id", () => {
    const runningState = terminalResponseReadyReducer(createDefaultTerminalResponseReadyState(), {
      terminalId: "terminal_1",
      turnId: "turn_1",
      kind: "mark-running",
      workspaceId: "workspace_1",
    });

    expect(
      terminalResponseReadyReducer(runningState, {
        terminalId: "terminal_1",
        turnId: null,
        kind: "mark-running",
        workspaceId: "workspace_1",
      }).runningStateByTerminalId,
    ).toEqual({
      terminal_1: {
        turnId: "turn_1",
        workspaceId: "workspace_1",
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
      runningStateByTerminalId: {},
    };

    expect(
      terminalResponseReadyReducer(initialState, {
        terminalId: "terminal_1",
        kind: "acknowledge-terminal",
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
      runningStateByTerminalId: {},
    });
  });

  test("ignores duplicate completion events for an acknowledged turn", () => {
    const acknowledgedState = terminalResponseReadyReducer(
      terminalResponseReadyReducer(createDefaultTerminalResponseReadyState(), {
        completionKey: "codex:turn_1",
        terminalId: "terminal_1",
        kind: "mark-ready",
        workspaceId: "workspace_1",
      }),
      {
        terminalId: "terminal_1",
        kind: "acknowledge-terminal",
      },
    );

    expect(
      terminalResponseReadyReducer(acknowledgedState, {
        completionKey: "codex:turn_1",
        terminalId: "terminal_1",
        kind: "mark-ready",
        workspaceId: "workspace_1",
      }),
    ).toEqual(acknowledgedState);
  });

  test("marks a terminal ready again when a new turn completes", () => {
    const acknowledgedState = terminalResponseReadyReducer(
      terminalResponseReadyReducer(createDefaultTerminalResponseReadyState(), {
        completionKey: "codex:turn_1",
        terminalId: "terminal_1",
        kind: "mark-ready",
        workspaceId: "workspace_1",
      }),
      {
        terminalId: "terminal_1",
        kind: "acknowledge-terminal",
      },
    );

    expect(
      terminalResponseReadyReducer(acknowledgedState, {
        completionKey: "codex:turn_2",
        terminalId: "terminal_1",
        kind: "mark-ready",
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
      runningStateByTerminalId: {},
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
      runningStateByTerminalId: {
        terminal_4: {
          turnId: "turn_4",
          workspaceId: "workspace_1",
        },
      },
    };

    expect(
      terminalResponseReadyReducer(initialState, {
        kind: "acknowledge-workspace",
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
      runningStateByTerminalId: {
        terminal_4: {
          turnId: "turn_4",
          workspaceId: "workspace_1",
        },
      },
    });
  });

  test("clears ready and running state together when a terminal is removed", () => {
    const initialState = {
      acknowledgedCompletionKeyByTerminalId: {},
      readyStateByTerminalId: {
        terminal_1: {
          completionKey: "codex:turn_1",
          workspaceId: "workspace_1",
        },
      },
      runningStateByTerminalId: {
        terminal_1: {
          turnId: "turn_1",
          workspaceId: "workspace_1",
        },
      },
    };

    expect(
      terminalResponseReadyReducer(initialState, {
        terminalId: "terminal_1",
        kind: "clear-terminal",
      }),
    ).toEqual({
      acknowledgedCompletionKeyByTerminalId: {},
      readyStateByTerminalId: {},
      runningStateByTerminalId: {},
    });
  });
});

describe("workspace id selectors", () => {
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
        runningStateByTerminalId: {},
      }),
    ).toEqual(["workspace_1", "workspace_2"]);
  });

  test("deduplicates workspaces when multiple terminals are running", () => {
    expect(
      getRunningWorkspaceIds({
        acknowledgedCompletionKeyByTerminalId: {},
        readyStateByTerminalId: {},
        runningStateByTerminalId: {
          terminal_1: {
            turnId: "turn_1",
            workspaceId: "workspace_1",
          },
          terminal_2: {
            turnId: "turn_2",
            workspaceId: "workspace_1",
          },
          terminal_3: {
            turnId: "turn_3",
            workspaceId: "workspace_2",
          },
        },
      }),
    ).toEqual(["workspace_1", "workspace_2"]);
  });
});
