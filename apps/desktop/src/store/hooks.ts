import { useMemo, useRef, useSyncExternalStore } from "react";
import type {
  AgentMessageWithParts,
  AgentSessionRecord,
  RepositoryRecord,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import { groupWorkspacesByRepository, type Collection } from "@lifecycle/store";
import { getOrCreateAgentMessageCollection } from "@lifecycle/store/internal/agent-messages";
import {
  getOrCreateAgentSessionCollection,
  refreshAgentSessionCollection,
} from "@lifecycle/store/internal/agent-sessions";
import { useLiveQuery } from "@tanstack/react-db";
import { useStoreContext } from "@/store/provider";

const EMPTY_ARRAY: never[] = [];

/**
 * Subscribe to a TanStack DB collection and return its current values as an array.
 * Re-renders only when the collection emits changes.
 */
function useCollectionArray<T extends object>(collection: Collection<T, string>): T[] {
  const cachedRef = useRef<T[]>([]);
  const versionRef = useRef(0);

  const subscribe = useMemo(
    () => (onStoreChange: () => void) => {
      const sub = collection.subscribeChanges(() => {
        versionRef.current += 1;
        cachedRef.current = collection.toArray;
        onStoreChange();
      });
      // Hydrate on first subscribe
      cachedRef.current = collection.toArray;
      return () => sub.unsubscribe();
    },
    [collection],
  );

  const getSnapshot = useMemo(() => () => cachedRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Subscribe to a TanStack DB collection and return a single item by key.
 * Re-renders only when the collection emits changes.
 */
function useCollectionItem<T extends object>(
  collection: Collection<T, string>,
  key: string | null,
): T | undefined {
  const cachedRef = useRef<T | undefined>(undefined);

  const subscribe = useMemo(
    () => (onStoreChange: () => void) => {
      const sub = collection.subscribeChanges(() => {
        const next = key ? collection.get(key) : undefined;
        // Only notify React if the item actually changed.
        if (next !== cachedRef.current) {
          cachedRef.current = next;
          onStoreChange();
        }
      });
      // Hydrate on first subscribe
      cachedRef.current = key ? collection.get(key) : undefined;
      return () => sub.unsubscribe();
    },
    [collection, key],
  );

  const getSnapshot = useMemo(() => () => cachedRef.current, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// ── Entity hooks ──

export function useRepositories(): RepositoryRecord[] {
  const { collections } = useStoreContext();
  return useCollectionArray(collections.repositories);
}

export function useRepository(repositoryId: string | null): RepositoryRecord | undefined {
  const { collections } = useStoreContext();
  return useCollectionItem(collections.repositories, repositoryId);
}

export function useWorkspaces(): WorkspaceRecord[] {
  const { collections } = useStoreContext();
  return useCollectionArray(collections.workspaces);
}

export function useWorkspace(workspaceId: string | null): WorkspaceRecord | undefined {
  const { collections } = useStoreContext();
  return useCollectionItem(collections.workspaces, workspaceId);
}

export function useWorkspacesByRepository(): Record<string, WorkspaceRecord[]> {
  const workspaces = useWorkspaces();
  return useMemo(() => groupWorkspacesByRepository(workspaces), [workspaces]);
}

export function useWorkspaceServices(workspaceId: string): ServiceRecord[] {
  const { collections } = useStoreContext();
  const allServices = useCollectionArray(collections.services);
  return useMemo(
    () => allServices.filter((s) => s.workspace_id === workspaceId),
    [allServices, workspaceId],
  );
}

export function useAgentSessions(workspaceId: string): AgentSessionRecord[] {
  const { driver, collections } = useStoreContext();

  const sqlCollection = useMemo(() => {
    return getOrCreateAgentSessionCollection(collections.agentSessionRegistry, driver, workspaceId);
  }, [collections.agentSessionRegistry, driver, workspaceId]);

  const { data } = useLiveQuery(
    (q) => q.from({ s: sqlCollection }).orderBy(({ s }) => s.created_at, "desc"),
    [sqlCollection],
  );

  return data ?? EMPTY_ARRAY;
}

export function useAgentSessionRefresh(workspaceId: string): () => void {
  const { collections } = useStoreContext();

  return useMemo(() => {
    return () => {
      refreshAgentSessionCollection(collections.agentSessionRegistry, workspaceId);
    };
  }, [collections.agentSessionRegistry, workspaceId]);
}

export function useAgentMessages(sessionId: string): {
  data: AgentMessageWithParts[];
  error: Error | null;
} {
  const { driver, collections } = useStoreContext();

  const sqlCollection = useMemo(() => {
    return getOrCreateAgentMessageCollection(collections.agentMessageRegistry, driver, sessionId);
  }, [collections.agentMessageRegistry, driver, sessionId]);
  const collectionError = useSyncExternalStore(
    sqlCollection.utils.subscribeState,
    sqlCollection.utils.getError,
    sqlCollection.utils.getError,
  );

  const { data, status } = useLiveQuery(
    (q) => q.from({ msg: sqlCollection }).orderBy(({ msg }) => msg.created_at),
    [sqlCollection],
  );

  // Keep a per-session cache so we never flash empty during collection
  // recreation (HMR, reattach, navigation). Only update the cache when
  // the collection is ready and has data, or when it's ready with genuinely
  // zero messages (new session).
  const cacheRef = useRef<{ sessionId: string; messages: AgentMessageWithParts[] }>({
    sessionId,
    messages: [],
  });

  const resolved = data ?? [];
  const isReady = status === "ready";

  if (isReady) {
    cacheRef.current = { sessionId, messages: resolved };
  }

  // If session changed, don't serve stale data from a different session.
  const cached =
    cacheRef.current.sessionId === sessionId ? cacheRef.current.messages : [];

  return {
    data: isReady ? resolved : cached,
    error: collectionError,
  };
}
