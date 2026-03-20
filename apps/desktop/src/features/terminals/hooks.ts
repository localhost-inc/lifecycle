import type { TerminalRecord } from "@lifecycle/contracts";
import { useMemo } from "react";
import type { QueryResult } from "@/query";
import { useQuery } from "@/query";
import { createTerminalQuery, createWorkspaceTerminalsQuery } from "@/features/terminals/queries";

interface TerminalQueryOptions {
  enabled?: boolean;
}

export function useWorkspaceTerminals(
  workspaceId: string | null,
  options?: TerminalQueryOptions,
): QueryResult<TerminalRecord[] | undefined> {
  const enabled = options?.enabled ?? true;
  const descriptor = useMemo(
    () => (workspaceId && enabled ? createWorkspaceTerminalsQuery(workspaceId) : null),
    [enabled, workspaceId],
  );

  return useQuery(descriptor);
}

export function useTerminal(terminalId: string | null): QueryResult<TerminalRecord | null> {
  const descriptor = useMemo(
    () => (terminalId ? createTerminalQuery(terminalId) : null),
    [terminalId],
  );

  return useQuery(descriptor);
}
