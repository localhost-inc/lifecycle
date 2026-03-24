import { useMemo, useRef, useSyncExternalStore } from "react";
import type { AgentMessageWithParts, AgentSessionRecord } from "@lifecycle/contracts";
import { getOrCreateAgentMessageCollection } from "@/store/collections/agent-messages";
import { useAgentSessions as useStoreAgentSessions } from "@/store";
import { useStoreContext } from "@/store/provider";

const EMPTY_AGENT_MESSAGES: AgentMessageWithParts[] = [];
const NO_AGENT_COLLECTION_ERROR = () => null;
const NO_AGENT_COLLECTION_SUBSCRIBE = () => () => {};

export function useAgentSessions(workspaceId: string | null): AgentSessionRecord[] {
  return useStoreAgentSessions(workspaceId ?? "");
}

export function useAgentSession(
  workspaceId: string,
  agentSessionId: string | null,
): AgentSessionRecord | undefined {
  const sessions = useStoreAgentSessions(workspaceId);
  return agentSessionId ? sessions.find((session) => session.id === agentSessionId) : undefined;
}

export function useAgentSessionMessages(agentSessionId: string | null): {
  data: AgentMessageWithParts[] | undefined;
  error: Error | null;
  isLoading: boolean;
} {
  const { driver } = useStoreContext();
  const hasSessionId = typeof agentSessionId === "string" && agentSessionId.trim().length > 0;
  const sqlCollection = useMemo(() => {
    return hasSessionId ? getOrCreateAgentMessageCollection(driver, agentSessionId) : null;
  }, [agentSessionId, driver, hasSessionId]);

  const collectionError = useSyncExternalStore(
    sqlCollection?.subscribeState ?? NO_AGENT_COLLECTION_SUBSCRIBE,
    sqlCollection?.getError ?? NO_AGENT_COLLECTION_ERROR,
    sqlCollection?.getError ?? NO_AGENT_COLLECTION_ERROR,
  );

  const collection = sqlCollection?.collection ?? null;
  const cachedRef = useRef<AgentMessageWithParts[]>(EMPTY_AGENT_MESSAGES);

  const subscribe = useMemo(() => {
    if (!collection) return NO_AGENT_COLLECTION_SUBSCRIBE;
    return (onStoreChange: () => void) => {
      const sub = collection.subscribeChanges(() => {
        cachedRef.current = collection.toArray;
        onStoreChange();
      });
      // Hydrate synchronously on first subscribe so data is available immediately
      cachedRef.current = collection.toArray;
      return () => sub.unsubscribe();
    };
  }, [collection]);

  const getSnapshot = useMemo(() => () => cachedRef.current, []);

  const data = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    data: agentSessionId ? data : undefined,
    error: agentSessionId ? collectionError : null,
    isLoading: false,
  };
}
