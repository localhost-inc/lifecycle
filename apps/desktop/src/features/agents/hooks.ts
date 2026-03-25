import { useMemo } from "react";
import type { AgentMessageWithParts, AgentSessionRecord } from "@lifecycle/contracts";
import { useAgentMessages, useAgentSessions as useStoreAgentSessions } from "@/store";

export function useAgentSessions(workspaceId: string | null): AgentSessionRecord[] {
  return useStoreAgentSessions(workspaceId ?? "");
}

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
): { data: AgentMessageWithParts[] | undefined; error: Error | null; isLoading: boolean } {
  const messages = useAgentMessages(agentSessionId ?? "");

  return useMemo(
    () => ({
      data: agentSessionId ? messages.data : undefined,
      error: agentSessionId ? messages.error : null,
      isLoading: false,
    }),
    [agentSessionId, messages.data, messages.error],
  );
}
