import { useMemo } from "react";
import type { QueryResult } from "@/query";
import { useQuery } from "@/query";
import type { TerminalRecord } from "@lifecycle/contracts";
import { createWorkspaceTerminalsQuery } from "@/features/terminals/queries";

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
