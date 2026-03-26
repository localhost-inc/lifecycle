import { useMemo, useRef, useSyncExternalStore } from "react";
import type {
  AgentMessageWithParts,
  AgentSessionRecord,
  ProjectRecord,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import { groupWorkspacesByProject, type Collection } from "@lifecycle/store";
import { useLiveQuery } from "@tanstack/react-db";
import {
  getOrCreateAgentSessionCollection,
  refreshAgentSessionCollection,
} from "@/store/collections/agent-sessions";
import { getOrCreateAgentMessageCollection } from "@/store/collections/agent-messages";
import { useStoreContext } from "@/store/provider";

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
        cachedRef.current = key ? collection.get(key) : undefined;
        onStoreChange();
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

export function useProjects(): ProjectRecord[] {
  const { collections } = useStoreContext();
  return useCollectionArray(collections.projects);
}

export function useProject(projectId: string | null): ProjectRecord | undefined {
  const { collections } = useStoreContext();
  return useCollectionItem(collections.projects, projectId);
}

export function useWorkspaces(): WorkspaceRecord[] {
  const { collections } = useStoreContext();
  return useCollectionArray(collections.workspaces);
}

export function useWorkspace(workspaceId: string | null): WorkspaceRecord | undefined {
  const { collections } = useStoreContext();
  return useCollectionItem(collections.workspaces, workspaceId);
}

export function useWorkspacesByProject(): Record<string, WorkspaceRecord[]> {
  const workspaces = useWorkspaces();
  return useMemo(() => groupWorkspacesByProject(workspaces), [workspaces]);
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
  const { driver } = useStoreContext();

  const sqlCollection = useMemo(() => {
    return getOrCreateAgentSessionCollection(driver, workspaceId);
  }, [driver, workspaceId]);

  const { data } = useLiveQuery(
    (q) => q.from({ s: sqlCollection }).orderBy(({ s }) => s.created_at, "desc"),
    [sqlCollection],
  );

  return data ?? [];
}

export function useAgentSessionRefresh(workspaceId: string): () => void {
  return useMemo(() => {
    return () => {
      refreshAgentSessionCollection(workspaceId);
    };
  }, [workspaceId]);
}

export function useAgentMessages(sessionId: string): {
  data: AgentMessageWithParts[];
  error: Error | null;
} {
  const { driver } = useStoreContext();

  const sqlCollection = useMemo(() => {
    return getOrCreateAgentMessageCollection(driver, sessionId);
  }, [driver, sessionId]);
  const collectionError = useSyncExternalStore(
    sqlCollection.utils.subscribeState,
    sqlCollection.utils.getError,
    sqlCollection.utils.getError,
  );

  const { data } = useLiveQuery(
    (q) => q.from({ msg: sqlCollection }).orderBy(({ msg }) => msg.created_at),
    [sqlCollection],
  );

  return {
    data: data ?? [],
    error: collectionError,
  };
}
