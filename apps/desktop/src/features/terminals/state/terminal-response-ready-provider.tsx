import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { LifecycleEventType } from "@lifecycle/contracts";
import { useLifecycleEvent } from "../../events";

export interface TerminalResponseReadyState {
  acknowledgedCompletionKeyByTerminalId: Record<string, string>;
  readyStateByTerminalId: Record<
    string,
    {
      completionKey: string;
      workspaceId: string;
    }
  >;
}

type TerminalResponseReadyAction =
  | { type: "mark-ready"; completionKey: string; terminalId: string; workspaceId: string }
  | { type: "acknowledge-terminal"; terminalId: string }
  | { type: "acknowledge-workspace"; workspaceId: string }
  | { type: "clear-terminal"; terminalId: string }
  | { type: "clear-workspace"; workspaceId: string };

interface TerminalResponseReadyContextValue {
  clearTerminalResponseReady: (terminalId: string) => void;
  clearWorkspaceResponseReady: (workspaceId: string) => void;
  hasWorkspaceResponseReady: (workspaceId: string) => boolean;
  isTerminalResponseReady: (terminalId: string) => boolean;
}

const TerminalResponseReadyContext = createContext<TerminalResponseReadyContextValue | null>(null);
const TERMINAL_RESPONSE_READY_EVENT_TYPES = [
  "terminal.harness_turn_completed",
  "terminal.status_changed",
] as const satisfies readonly LifecycleEventType[];

export function createDefaultTerminalResponseReadyState(): TerminalResponseReadyState {
  return {
    acknowledgedCompletionKeyByTerminalId: {},
    readyStateByTerminalId: {},
  };
}

export function terminalResponseReadyReducer(
  state: TerminalResponseReadyState,
  action: TerminalResponseReadyAction,
): TerminalResponseReadyState {
  switch (action.type) {
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
        acknowledgedCompletionKeyByTerminalId: nextAcknowledgedCompletionKeyByTerminalId,
        readyStateByTerminalId: nextReadyStateByTerminalId,
      };
    }
    case "clear-terminal": {
      const hadAcknowledgedCompletionKey =
        action.terminalId in state.acknowledgedCompletionKeyByTerminalId;
      const hadReadyState = action.terminalId in state.readyStateByTerminalId;
      if (!hadAcknowledgedCompletionKey && !hadReadyState) {
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

      return {
        acknowledgedCompletionKeyByTerminalId: nextAcknowledgedCompletionKeyByTerminalId,
        readyStateByTerminalId: nextReadyStateByTerminalId,
      };
    }
    case "clear-workspace": {
      let changed = false;
      const nextReadyStateByTerminalId: TerminalResponseReadyState["readyStateByTerminalId"] = {};

      for (const [terminalId, readyState] of Object.entries(state.readyStateByTerminalId)) {
        if (readyState.workspaceId === action.workspaceId) {
          changed = true;
          continue;
        }

        nextReadyStateByTerminalId[terminalId] = readyState;
      }

      if (!changed) {
        return state;
      }

      return {
        ...state,
        readyStateByTerminalId: nextReadyStateByTerminalId,
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

export function TerminalResponseReadyProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    terminalResponseReadyReducer,
    undefined,
    createDefaultTerminalResponseReadyState,
  );

  useLifecycleEvent(TERMINAL_RESPONSE_READY_EVENT_TYPES, (event) => {
    switch (event.type) {
      case "terminal.harness_turn_completed":
        dispatch({
          completionKey: event.completion_key,
          terminalId: event.terminal_id,
          type: "mark-ready",
          workspaceId: event.workspace_id,
        });
        break;
      case "terminal.status_changed":
        if (event.status !== "failed" && event.status !== "finished") {
          break;
        }

        dispatch({
          terminalId: event.terminal_id,
          type: "clear-terminal",
        });
        break;
    }
  });

  const readyWorkspaceIds = useMemo(() => new Set(getResponseReadyWorkspaceIds(state)), [state]);

  const clearTerminalResponseReady = useCallback((terminalId: string) => {
    dispatch({
      terminalId,
      type: "acknowledge-terminal",
    });
  }, []);

  const clearWorkspaceResponseReady = useCallback((workspaceId: string) => {
    dispatch({
      type: "acknowledge-workspace",
      workspaceId,
    });
  }, []);

  const isTerminalResponseReady = useCallback(
    (terminalId: string) => terminalId in state.readyStateByTerminalId,
    [state.readyStateByTerminalId],
  );

  const hasWorkspaceResponseReady = useCallback(
    (workspaceId: string) => readyWorkspaceIds.has(workspaceId),
    [readyWorkspaceIds],
  );

  const contextValue = useMemo<TerminalResponseReadyContextValue>(
    () => ({
      clearTerminalResponseReady,
      clearWorkspaceResponseReady,
      hasWorkspaceResponseReady,
      isTerminalResponseReady,
    }),
    [
      clearTerminalResponseReady,
      clearWorkspaceResponseReady,
      hasWorkspaceResponseReady,
      isTerminalResponseReady,
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
