import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type {
  AgentSessionRecord,
  ProjectRecord,
  ServiceRecord,
  TerminalRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import {
  createSqlCollection,
  groupWorkspacesByProject,
  selectAgentSessionsByWorkspace,
  type Collection,
  type SqlCollection,
} from "@lifecycle/store";
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

// Agent sessions are loaded per-workspace since the table can grow large.
// We use a separate SqlCollection per workspace, created on demand.
const agentSessionCollections = new Map<string, SqlCollection<AgentSessionRecord>>();

export function useAgentSessions(workspaceId: string): AgentSessionRecord[] {
  const { driver } = useStoreContext();

  const sqlCollection = useMemo(() => {
    let existing = agentSessionCollections.get(workspaceId);
    if (!existing) {
      existing = createSqlCollection<AgentSessionRecord>({
        id: `agent-sessions-${workspaceId}`,
        driver,
        loadFn: (d) => selectAgentSessionsByWorkspace(d, workspaceId),
        getKey: (s) => s.id,
      });
      agentSessionCollections.set(workspaceId, existing);
    }
    return existing;
  }, [driver, workspaceId]);

  return useCollectionArray(sqlCollection.collection);
}

export function useAgentSessionRefresh(workspaceId: string): () => void {
  return useMemo(() => {
    return () => {
      const existing = agentSessionCollections.get(workspaceId);
      if (existing) {
        void existing.refresh();
      }
    };
  }, [workspaceId]);
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
