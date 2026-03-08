import { useMemo } from "react";
import type { QueryDescriptor, QueryUpdate, StoreEvent, StoreQueryResult } from "../../store";
import { useStoreQuery } from "../../store";
import type { TerminalRow } from "./api";

export const terminalKeys = {
  byWorkspace: (workspaceId: string) => ["workspace-terminals", workspaceId] as const,
  detail: (terminalId: string) => ["terminal", terminalId] as const,
};

export function reduceWorkspaceTerminals(
  current: TerminalRow[] | undefined,
  event: StoreEvent,
  workspaceId: string,
): QueryUpdate<TerminalRow[]> {
  if (event.kind === "terminal-created" && event.workspaceId === workspaceId) {
    const previous = current ?? [];
    if (previous.some((terminal) => terminal.id === event.terminal.id)) {
      return { type: "none" };
    }

    return {
      type: "replace",
      data: [event.terminal, ...previous],
    };
  }

  if (event.kind === "terminal-status-changed" && event.workspaceId === workspaceId) {
    if (!current) {
      return { type: "invalidate" };
    }

    let found = false;
    const next = current.map((terminal) => {
      if (terminal.id !== event.terminalId) {
        return terminal;
      }

      found = true;
      return {
        ...terminal,
        ended_at: event.endedAt,
        exit_code: event.exitCode,
        failure_reason: event.failureReason,
        status: event.status,
      };
    });

    return found ? { type: "replace", data: next } : { type: "invalidate" };
  }

  if (event.kind === "terminal-renamed" && event.workspaceId === workspaceId) {
    if (!current) {
      return { type: "invalidate" };
    }

    let found = false;
    const next = current.map((terminal) => {
      if (terminal.id !== event.terminalId) {
        return terminal;
      }

      found = true;
      return {
        ...terminal,
        label: event.label,
      };
    });

    return found ? { type: "replace", data: next } : { type: "invalidate" };
  }

  if (event.kind === "terminal-removed" && event.workspaceId === workspaceId) {
    if (!current) {
      return { type: "invalidate" };
    }

    return {
      type: "replace",
      data: current.filter((terminal) => terminal.id !== event.terminalId),
    };
  }

  return { type: "none" };
}

function createWorkspaceTerminalsQuery(workspaceId: string): QueryDescriptor<TerminalRow[]> {
  return {
    key: terminalKeys.byWorkspace(workspaceId),
    fetch(source) {
      return source.listWorkspaceTerminals(workspaceId);
    },
    reduce(current, event) {
      return reduceWorkspaceTerminals(current, event, workspaceId);
    },
  };
}

export function reduceTerminal(
  current: TerminalRow | null | undefined,
  event: StoreEvent,
  terminalId: string,
): QueryUpdate<TerminalRow | null> {
  if (event.kind === "terminal-created" && event.terminal.id === terminalId) {
    return {
      type: "replace",
      data: event.terminal,
    };
  }

  if (event.kind === "terminal-status-changed" && event.terminalId === terminalId) {
    if (!current) {
      return { type: "invalidate" };
    }

    return {
      type: "replace",
      data: {
        ...current,
        ended_at: event.endedAt,
        exit_code: event.exitCode,
        failure_reason: event.failureReason,
        status: event.status,
      },
    };
  }

  if (event.kind === "terminal-renamed" && event.terminalId === terminalId) {
    if (!current) {
      return { type: "invalidate" };
    }

    return {
      type: "replace",
      data: {
        ...current,
        label: event.label,
      },
    };
  }

  if (event.kind === "terminal-removed" && event.terminalId === terminalId) {
    return {
      type: "replace",
      data: null,
    };
  }

  return { type: "none" };
}

function createTerminalQuery(terminalId: string): QueryDescriptor<TerminalRow | null> {
  return {
    key: terminalKeys.detail(terminalId),
    fetch(source) {
      return source.getTerminal(terminalId);
    },
    reduce(current, event) {
      return reduceTerminal(current, event, terminalId);
    },
  };
}

export function useWorkspaceTerminals(
  workspaceId: string | null,
): StoreQueryResult<TerminalRow[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceTerminalsQuery(workspaceId) : null),
    [workspaceId],
  );

  return useStoreQuery(descriptor, {
    disabledData: undefined,
  });
}

export function useTerminal(terminalId: string | null): StoreQueryResult<TerminalRow | null> {
  const descriptor = useMemo(
    () => (terminalId ? createTerminalQuery(terminalId) : null),
    [terminalId],
  );

  return useStoreQuery(descriptor, {
    disabledData: null,
  });
}
