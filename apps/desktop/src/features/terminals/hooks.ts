import type { LifecycleEvent, LifecycleEventType, TerminalRecord } from "@lifecycle/contracts";
import { useMemo } from "react";
import type { QueryDescriptor, QueryResult, QueryUpdate } from "../../query";
import { useQuery } from "../../query";

const TERMINAL_EVENT_TYPES = [
  "terminal.created",
  "terminal.status_changed",
  "terminal.renamed",
] as const satisfies readonly LifecycleEventType[];

export const terminalKeys = {
  byWorkspace: (workspaceId: string) => ["workspace-terminals", workspaceId] as const,
  detail: (terminalId: string) => ["terminal", terminalId] as const,
};

export function reduceWorkspaceTerminals(
  current: TerminalRecord[] | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<TerminalRecord[]> {
  if (event.type === "terminal.created" && event.workspace_id === workspaceId) {
    const previous = current ?? [];
    if (previous.some((terminal) => terminal.id === event.terminal.id)) {
      return { type: "none" };
    }

    return {
      type: "replace",
      data: [event.terminal, ...previous],
    };
  }

  if (event.type === "terminal.status_changed" && event.workspace_id === workspaceId) {
    if (!current) {
      return { type: "invalidate" };
    }

    let found = false;
    const next = current.map((terminal) => {
      if (terminal.id !== event.terminal_id) {
        return terminal;
      }

      found = true;
      return {
        ...terminal,
        ended_at: event.ended_at,
        exit_code: event.exit_code,
        failure_reason: event.failure_reason,
        status: event.status,
      };
    });

    return found ? { type: "replace", data: next } : { type: "invalidate" };
  }

  if (event.type === "terminal.renamed" && event.workspace_id === workspaceId) {
    if (!current) {
      return { type: "invalidate" };
    }

    let found = false;
    const next = current.map((terminal) => {
      if (terminal.id !== event.terminal_id) {
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

  return { type: "none" };
}

function createWorkspaceTerminalsQuery(workspaceId: string): QueryDescriptor<TerminalRecord[]> {
  return {
    eventTypes: TERMINAL_EVENT_TYPES,
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
  current: TerminalRecord | null | undefined,
  event: LifecycleEvent,
  terminalId: string,
): QueryUpdate<TerminalRecord | null> {
  if (event.type === "terminal.created" && event.terminal.id === terminalId) {
    return {
      type: "replace",
      data: event.terminal,
    };
  }

  if (event.type === "terminal.status_changed" && event.terminal_id === terminalId) {
    if (!current) {
      return { type: "invalidate" };
    }

    return {
      type: "replace",
      data: {
        ...current,
        ended_at: event.ended_at,
        exit_code: event.exit_code,
        failure_reason: event.failure_reason,
        status: event.status,
      },
    };
  }

  if (event.type === "terminal.renamed" && event.terminal_id === terminalId) {
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

  return { type: "none" };
}

function createTerminalQuery(terminalId: string): QueryDescriptor<TerminalRecord | null> {
  return {
    eventTypes: TERMINAL_EVENT_TYPES,
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
): QueryResult<TerminalRecord[] | undefined> {
  const descriptor = useMemo(
    () => (workspaceId ? createWorkspaceTerminalsQuery(workspaceId) : null),
    [workspaceId],
  );

  return useQuery(descriptor, {
    disabledData: undefined,
  });
}

export function useTerminal(terminalId: string | null): QueryResult<TerminalRecord | null> {
  const descriptor = useMemo(
    () => (terminalId ? createTerminalQuery(terminalId) : null),
    [terminalId],
  );

  return useQuery(descriptor, {
    disabledData: null,
  });
}
