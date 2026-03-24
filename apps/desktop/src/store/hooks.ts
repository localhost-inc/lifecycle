import { useMemo, useRef, useSyncExternalStore } from "react";
import type {
  AgentMessageWithParts,
  AgentSessionRecord,
  ProjectRecord,
  ServiceRecord,
  TerminalRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import {
  groupWorkspacesByProject,
  type Collection,
} from "@lifecycle/store";
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
  return useCollectionArray(collections.projects.collection);
}

export function useWorkspaces(): WorkspaceRecord[] {
  const { collections } = useStoreContext();
  return useCollectionArray(collections.workspaces.collection);
}

export function useWorkspace(workspaceId: string | null): WorkspaceRecord | undefined {
  const { collections } = useStoreContext();
  return useCollectionItem(collections.workspaces.collection, workspaceId);
}

export function useWorkspacesByProject(): Record<string, WorkspaceRecord[]> {
  const workspaces = useWorkspaces();
  return useMemo(() => groupWorkspacesByProject(workspaces), [workspaces]);
}

export function useWorkspaceServices(workspaceId: string): ServiceRecord[] {
  const { collections } = useStoreContext();
  const allServices = useCollectionArray(collections.services.collection);
  return useMemo(
    () => allServices.filter((s) => s.workspace_id === workspaceId),
    [allServices, workspaceId],
  );
}

export function useWorkspaceTerminals(workspaceId: string): TerminalRecord[] {
  const { collections } = useStoreContext();
  const allTerminals = useCollectionArray(collections.terminals.collection);
  return useMemo(
    () => allTerminals.filter((t) => t.workspace_id === workspaceId),
    [allTerminals, workspaceId],
  );
}

export function useAgentSessions(workspaceId: string): AgentSessionRecord[] {
  const { driver } = useStoreContext();

  const sqlCollection = useMemo(() => {
    return getOrCreateAgentSessionCollection(driver, workspaceId);
  }, [driver, workspaceId]);

  return useCollectionArray(sqlCollection.collection);
}

export function useAgentSessionRefresh(workspaceId: string): () => void {
  return useMemo(() => {
    return () => {
      refreshAgentSessionCollection(workspaceId);
    };
  }, [workspaceId]);
}

export function useAgentMessages(
  sessionId: string,
): { data: AgentMessageWithParts[]; error: Error | null } {
  const { driver } = useStoreContext();

  const sqlCollection = useMemo(() => {
    return getOrCreateAgentMessageCollection(driver, sessionId);
  }, [driver, sessionId]);
  const baseCollection = sqlCollection.collection;
  const collectionError = useSyncExternalStore(
    sqlCollection.subscribeState,
    sqlCollection.getError,
    sqlCollection.getError,
  );

  const { data } = useLiveQuery(
    (q) =>
      q
        .from({ msg: baseCollection })
        .orderBy(({ msg }) => msg.created_at),
    [baseCollection],
  );

  return {
    data: data ?? [],
    error: collectionError,
  };
}

// ── Runtime hook ──

/**
 * Returns the WorkspaceRuntime for the current target.
 * Currently always returns the host runtime; when cloud workspaces arrive,
 * this will look up the workspace target from the collection and select
 * the appropriate runtime provider.
 */
export function useRuntime(): WorkspaceRuntime {
  const { runtimeRegistry } = useStoreContext();
  // For now, all workspaces use the host runtime.
  // When cloud mode arrives, this will resolve per-workspace target.
  return runtimeRegistry.resolve("local");
}
