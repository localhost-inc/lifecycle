import type { LifecycleEvent, LifecycleEventKind, TerminalRecord } from "@lifecycle/contracts";
import { useMemo } from "react";
import type { QueryDescriptor, QueryResult, QueryUpdate } from "../../query";
import { useQuery } from "../../query";

const TERMINAL_EVENT_KINDS = [
  "terminal.created",
  "terminal.status_changed",
  "terminal.renamed",
] as const satisfies readonly LifecycleEventKind[];

export const terminalKeys = {
  byWorkspace: (workspaceId: string) => ["workspace-terminals", workspaceId] as const,
  detail: (terminalId: string) => ["terminal", terminalId] as const,
};

export function reduceWorkspaceTerminals(
  current: TerminalRecord[] | undefined,
  event: LifecycleEvent,
  workspaceId: string,
): QueryUpdate<TerminalRecord[]> {
  if (event.kind === "terminal.created" && event.workspace_id === workspaceId) {
    const previous = current ?? [];
    if (previous.some((terminal) => terminal.id === event.terminal.id)) {
      return { kind: "none" };
    }

    return {
      kind: "replace",
      data: [event.terminal, ...previous],
    };
  }

  if (event.kind === "terminal.status_changed" && event.workspace_id === workspaceId) {
    if (!current) {
      return { kind: "invalidate" };
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

    return found ? { kind: "replace", data: next } : { kind: "invalidate" };
  }

  if (event.kind === "terminal.renamed" && event.workspace_id === workspaceId) {
    if (!current) {
      return { kind: "invalidate" };
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

    return found ? { kind: "replace", data: next } : { kind: "invalidate" };
  }

  return { kind: "none" };
}

export function createWorkspaceTerminalsQuery(
  workspaceId: string,
): QueryDescriptor<TerminalRecord[]> {
  return {
    eventKinds: TERMINAL_EVENT_KINDS,
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
  if (event.kind === "terminal.created" && event.terminal.id === terminalId) {
    return {
      kind: "replace",
      data: event.terminal,
    };
  }

  if (event.kind === "terminal.status_changed" && event.terminal_id === terminalId) {
    if (!current) {
      return { kind: "invalidate" };
    }

    return {
      kind: "replace",
      data: {
        ...current,
        ended_at: event.ended_at,
        exit_code: event.exit_code,
        failure_reason: event.failure_reason,
        status: event.status,
      },
    };
  }

  if (event.kind === "terminal.renamed" && event.terminal_id === terminalId) {
    if (!current) {
      return { kind: "invalidate" };
    }

    return {
      kind: "replace",
      data: {
        ...current,
        label: event.label,
      },
    };
  }

  return { kind: "none" };
}

function createTerminalQuery(terminalId: string): QueryDescriptor<TerminalRecord | null> {
  return {
    eventKinds: TERMINAL_EVENT_KINDS,
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
