import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import type { LifecycleEventKind } from "@lifecycle/contracts";
import { useLifecycleEvent } from "@/features/events";

export interface TerminalResponseReadyState {
  acknowledgedCompletionKeyByTerminalId: Record<string, string>;
  readyStateByTerminalId: Record<
    string,
    {
      completionKey: string;
      workspaceId: string;
    }
  >;
  runningStateByTerminalId: Record<
    string,
    {
      turnId: string | null;
      workspaceId: string;
    }
  >;
}

type TerminalResponseReadyAction =
  | { kind: "mark-running"; terminalId: string; turnId: string | null; workspaceId: string }
  | { kind: "mark-ready"; completionKey: string; terminalId: string; workspaceId: string }
  | { kind: "acknowledge-terminal"; terminalId: string }
  | { kind: "acknowledge-workspace"; workspaceId: string }
  | { kind: "clear-running-terminal"; terminalId: string }
  | { kind: "clear-terminal"; terminalId: string }
  | { kind: "clear-workspace"; workspaceId: string };

interface TerminalResponseReadyContextValue {
  clearTerminalResponseReady: (terminalId: string) => void;
  clearTerminalTurnRunning: (terminalId: string) => void;
  clearWorkspaceResponseReady: (workspaceId: string) => void;
  hasWorkspaceRunningTurn: (workspaceId: string) => boolean;
  hasWorkspaceResponseReady: (workspaceId: string) => boolean;
  isTerminalResponseReady: (terminalId: string) => boolean;
  isTerminalTurnRunning: (terminalId: string) => boolean;
}

const TerminalResponseReadyContext = createContext<TerminalResponseReadyContextValue | null>(null);
const TERMINAL_RESPONSE_READY_EVENT_KINDS = [
  "terminal.status_changed",
] as const satisfies readonly LifecycleEventKind[];

export function createDefaultTerminalResponseReadyState(): TerminalResponseReadyState {
  return {
    acknowledgedCompletionKeyByTerminalId: {},
    readyStateByTerminalId: {},
    runningStateByTerminalId: {},
  };
}

export function terminalResponseReadyReducer(
  state: TerminalResponseReadyState,
  action: TerminalResponseReadyAction,
): TerminalResponseReadyState {
  switch (action.kind) {
    case "mark-running": {
      const currentRunningState = state.runningStateByTerminalId[action.terminalId];
      if (
        currentRunningState?.workspaceId === action.workspaceId &&
        currentRunningState.turnId === action.turnId
      ) {
        return state;
      }

      if (
        currentRunningState?.workspaceId === action.workspaceId &&
        currentRunningState.turnId !== null &&
        action.turnId === null
      ) {
        return state;
      }

      return {
        ...state,
        runningStateByTerminalId: {
          ...state.runningStateByTerminalId,
          [action.terminalId]: {
            turnId: action.turnId,
            workspaceId: action.workspaceId,
          },
        },
      };
    }
    case "mark-ready": {
      if (state.acknowledgedCompletionKeyByTerminalId[action.terminalId] === action.completionKey) {
        return state;
      }

      const currentReadyState = state.readyStateByTerminalId[action.terminalId];
      if (
        currentReadyState?.workspaceId === action.workspaceId &&
        currentReadyState.completionKey === action.completionKey
      ) {
        return state;
      }

      return {
        ...state,
        readyStateByTerminalId: {
          ...state.readyStateByTerminalId,
          [action.terminalId]: {
            completionKey: action.completionKey,
            workspaceId: action.workspaceId,
          },
        },
      };
    }
    case "acknowledge-terminal": {
      const currentReadyState = state.readyStateByTerminalId[action.terminalId];
      if (!currentReadyState) {
        return state;
      }

      const nextReadyStateByTerminalId = {
        ...state.readyStateByTerminalId,
      };
      delete nextReadyStateByTerminalId[action.terminalId];

      return {
        ...state,
        acknowledgedCompletionKeyByTerminalId: {
          ...state.acknowledgedCompletionKeyByTerminalId,
          [action.terminalId]: currentReadyState.completionKey,
        },
        readyStateByTerminalId: nextReadyStateByTerminalId,
      };
    }
    case "acknowledge-workspace": {
      let changed = false;
      let nextAcknowledgedCompletionKeyByTerminalId = state.acknowledgedCompletionKeyByTerminalId;
      const nextReadyStateByTerminalId: TerminalResponseReadyState["readyStateByTerminalId"] = {};

      for (const [terminalId, readyState] of Object.entries(state.readyStateByTerminalId)) {
        if (readyState.workspaceId === action.workspaceId) {
          changed = true;
          if (nextAcknowledgedCompletionKeyByTerminalId[terminalId] !== readyState.completionKey) {
            nextAcknowledgedCompletionKeyByTerminalId = {
              ...nextAcknowledgedCompletionKeyByTerminalId,
              [terminalId]: readyState.completionKey,
            };
          }
          continue;
        }

        nextReadyStateByTerminalId[terminalId] = readyState;
      }

      if (!changed) {
        return state;
      }

      return {
        ...state,
        acknowledgedCompletionKeyByTerminalId: nextAcknowledgedCompletionKeyByTerminalId,
        readyStateByTerminalId: nextReadyStateByTerminalId,
      };
    }
    case "clear-running-terminal": {
      if (!(action.terminalId in state.runningStateByTerminalId)) {
        return state;
      }

      const nextRunningStateByTerminalId = {
        ...state.runningStateByTerminalId,
      };
      delete nextRunningStateByTerminalId[action.terminalId];

      return {
        ...state,
        runningStateByTerminalId: nextRunningStateByTerminalId,
      };
    }
    case "clear-terminal": {
      const hadAcknowledgedCompletionKey =
        action.terminalId in state.acknowledgedCompletionKeyByTerminalId;
      const hadReadyState = action.terminalId in state.readyStateByTerminalId;
      const hadRunningState = action.terminalId in state.runningStateByTerminalId;
      if (!hadAcknowledgedCompletionKey && !hadReadyState && !hadRunningState) {
        return state;
      }

      const nextAcknowledgedCompletionKeyByTerminalId = {
        ...state.acknowledgedCompletionKeyByTerminalId,
      };
      delete nextAcknowledgedCompletionKeyByTerminalId[action.terminalId];

      const nextReadyStateByTerminalId = {
        ...state.readyStateByTerminalId,
      };
      delete nextReadyStateByTerminalId[action.terminalId];

      const nextRunningStateByTerminalId = {
        ...state.runningStateByTerminalId,
      };
      delete nextRunningStateByTerminalId[action.terminalId];

      return {
        acknowledgedCompletionKeyByTerminalId: nextAcknowledgedCompletionKeyByTerminalId,
        readyStateByTerminalId: nextReadyStateByTerminalId,
        runningStateByTerminalId: nextRunningStateByTerminalId,
      };
    }
    case "clear-workspace": {
      let changed = false;
      const nextReadyStateByTerminalId: TerminalResponseReadyState["readyStateByTerminalId"] = {};
      const nextRunningStateByTerminalId: TerminalResponseReadyState["runningStateByTerminalId"] =
        {};

      for (const [terminalId, readyState] of Object.entries(state.readyStateByTerminalId)) {
        if (readyState.workspaceId === action.workspaceId) {
          changed = true;
          continue;
        }

        nextReadyStateByTerminalId[terminalId] = readyState;
      }

      for (const [terminalId, runningState] of Object.entries(state.runningStateByTerminalId)) {
        if (runningState.workspaceId === action.workspaceId) {
          changed = true;
          continue;
        }

        nextRunningStateByTerminalId[terminalId] = runningState;
      }

      if (!changed) {
        return state;
      }

      return {
        ...state,
        readyStateByTerminalId: nextReadyStateByTerminalId,
        runningStateByTerminalId: nextRunningStateByTerminalId,
      };
    }
    default:
      return state;
  }
}

export function getResponseReadyWorkspaceIds(state: TerminalResponseReadyState): string[] {
  return [
    ...new Set(
      Object.values(state.readyStateByTerminalId).map((readyState) => readyState.workspaceId),
    ),
  ];
}

export function getRunningWorkspaceIds(state: TerminalResponseReadyState): string[] {
  return [
    ...new Set(
      Object.values(state.runningStateByTerminalId).map((runningState) => runningState.workspaceId),
    ),
  ];
}

export function TerminalResponseReadyProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    terminalResponseReadyReducer,
    undefined,
    () =>
      (import.meta.hot?.data?.terminalResponseReadyState as TerminalResponseReadyState) ??
      createDefaultTerminalResponseReadyState(),
  );

  // Persist state across HMR so active spinners survive hot reload.
  if (import.meta.hot) {
    import.meta.hot.data.terminalResponseReadyState = state;
  }

  useLifecycleEvent(TERMINAL_RESPONSE_READY_EVENT_KINDS, (event) => {
    switch (event.kind) {
      case "terminal.status_changed":
        if (event.status !== "failed" && event.status !== "finished") {
          break;
        }

        dispatch({
          terminalId: event.terminalId,
          kind: "clear-terminal",
        });
        break;
    }
  });

  const readyWorkspaceIds = useMemo(() => new Set(getResponseReadyWorkspaceIds(state)), [state]);
  const runningWorkspaceIds = useMemo(() => new Set(getRunningWorkspaceIds(state)), [state]);

  const clearTerminalResponseReady = useCallback((terminalId: string) => {
    dispatch({
      terminalId,
      kind: "acknowledge-terminal",
    });
  }, []);

  const clearTerminalTurnRunning = useCallback((terminalId: string) => {
    dispatch({
      terminalId,
      kind: "clear-running-terminal",
    });
  }, []);

  const clearWorkspaceResponseReady = useCallback((workspaceId: string) => {
    dispatch({
      kind: "acknowledge-workspace",
      workspaceId,
    });
  }, []);

  const isTerminalResponseReady = useCallback(
    (terminalId: string) => terminalId in state.readyStateByTerminalId,
    [state.readyStateByTerminalId],
  );

  const isTerminalTurnRunning = useCallback(
    (terminalId: string) => terminalId in state.runningStateByTerminalId,
    [state.runningStateByTerminalId],
  );

  const hasWorkspaceRunningTurn = useCallback(
    (workspaceId: string) => runningWorkspaceIds.has(workspaceId),
    [runningWorkspaceIds],
  );

  const hasWorkspaceResponseReady = useCallback(
    (workspaceId: string) => readyWorkspaceIds.has(workspaceId),
    [readyWorkspaceIds],
  );

  const contextValue = useMemo<TerminalResponseReadyContextValue>(
    () => ({
      clearTerminalResponseReady,
      clearTerminalTurnRunning,
      clearWorkspaceResponseReady,
      hasWorkspaceRunningTurn,
      hasWorkspaceResponseReady,
      isTerminalResponseReady,
      isTerminalTurnRunning,
    }),
    [
      clearTerminalResponseReady,
      clearTerminalTurnRunning,
      clearWorkspaceResponseReady,
      hasWorkspaceRunningTurn,
      hasWorkspaceResponseReady,
      isTerminalResponseReady,
      isTerminalTurnRunning,
    ],
  );

  return (
    <TerminalResponseReadyContext.Provider value={contextValue}>
      {children}
    </TerminalResponseReadyContext.Provider>
  );
}

export function useTerminalResponseReady(): TerminalResponseReadyContextValue {
  const context = useContext(TerminalResponseReadyContext);
  if (!context) {
    throw new Error("useTerminalResponseReady must be used within TerminalResponseReadyProvider");
  }

  return context;
}
