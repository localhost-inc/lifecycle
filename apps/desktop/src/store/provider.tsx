import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type {
  LifecycleEvent,
  LifecycleEventKind,
  ProjectRecord,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import {
  createProjectCollection,
  createSqlCollection,
  createWorkspaceCollection,
  selectAllServices,
  type SqlCollection,
  type SqlDriver,
} from "@lifecycle/store";
import { subscribeToLifecycleEvents } from "@/features/events";

const ENTITY_EVENT_KINDS: LifecycleEventKind[] = [
  "workspace.status.changed",
  "workspace.renamed",
  "workspace.archived",
  "service.status.changed",
  "service.process.exited",
  "agent.session.created",
  "agent.session.updated",
];

interface StoreCollections {
  projects: SqlCollection<ProjectRecord>;
  workspaces: SqlCollection<WorkspaceRecord>;
  services: SqlCollection<ServiceRecord>;
}

interface StoreContextValue {
  collections: StoreCollections;
  driver: SqlDriver;
}

interface StoreProviderHotState {
  collections: StoreCollections;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function createCollections(driver: SqlDriver): StoreCollections {
  return {
    projects: createProjectCollection(driver),
    workspaces: createWorkspaceCollection(driver),
    services: createSqlCollection<ServiceRecord>({
      id: "services",
      driver,
      loadFn: selectAllServices,
      getKey: (s) => s.id,
    }),
  };
}

function refreshForEvent(collections: StoreCollections, event: LifecycleEvent): void {
  switch (event.kind) {
    case "workspace.status.changed":
    case "workspace.renamed":
    case "workspace.archived":
      void collections.workspaces.utils.refresh();
      if (event.kind === "workspace.archived") {
        void collections.services.utils.refresh();
      }
      break;

    case "service.status.changed":
    case "service.process.exited":
      void collections.services.utils.refresh();
      break;

    case "agent.session.created":
    case "agent.session.updated":
      // Agent sessions are loaded per-workspace on demand, not globally.
      // Components that need them use useAgentSessions(workspaceId).
      break;
  }
}

export function StoreProvider({
  driver,
  children,
}: PropsWithChildren<{
  driver: SqlDriver;
}>) {
  const hotState = import.meta.hot?.data as StoreProviderHotState | undefined;
  const [collections] = useState(() => hotState?.collections ?? createCollections(driver));

  if (import.meta.hot) {
    import.meta.hot.data.collections = collections;
  }

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void subscribeToLifecycleEvents(ENTITY_EVENT_KINDS, (event) => {
      refreshForEvent(collections, event);
    }).then((cleanup) => {
      if (disposed) {
        cleanup();
        return;
      }
      unlisten = cleanup;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [collections]);

  const value = useMemo(
    () => ({
      collections,
      driver,
    }),
    [collections, driver],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStoreContext(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error("StoreProvider is required");
  }
  return ctx;
}
