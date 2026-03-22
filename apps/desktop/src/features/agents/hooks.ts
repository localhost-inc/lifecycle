import { useMemo } from "react";
import type { AgentMessageRecord, AgentSessionRecord } from "@lifecycle/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAgentSessions as useStoreAgentSessions } from "@/store";
import { listAgentSessionMessages } from "@/features/agents/api";

export function useAgentSessions(workspaceId: string | null): AgentSessionRecord[] {
  return useStoreAgentSessions(workspaceId ?? "");
}

/**
 * Find a single agent session from the workspace-scoped collection.
 * Requires the workspaceId because agent sessions are indexed by workspace in the store.
 */
export function useAgentSession(
  workspaceId: string,
  agentSessionId: string | null,
): AgentSessionRecord | undefined {
  const sessions = useStoreAgentSessions(workspaceId);
  return useMemo(
    () => (agentSessionId ? sessions.find((s) => s.id === agentSessionId) : undefined),
    [agentSessionId, sessions],
  );
}

export function useAgentSessionMessages(
  agentSessionId: string | null,
): { data: AgentMessageRecord[] | undefined; isLoading: boolean } {
  const query = useQuery({
    queryKey: ["agents", "messages", agentSessionId],
    queryFn: () => listAgentSessionMessages(agentSessionId!),
    enabled: agentSessionId !== null,
    refetchOnWindowFocus: false,
  });

  return useMemo(
    () => ({
      data: query.data,
      isLoading: query.isLoading,
    }),
    [query.data, query.isLoading],
  );
}

/**
 * Returns a function to invalidate agent session messages in React Query cache.
 * Used when events indicate messages have changed (e.g. turn completed).
 */
export function useInvalidateAgentSessionMessages(): (agentSessionId: string) => void {
  const queryClient = useQueryClient();
  return useMemo(
    () => (agentSessionId: string) => {
      void queryClient.invalidateQueries({
        queryKey: ["agents", "messages", agentSessionId],
      });
    },
    [queryClient],
  );
}
