import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import type { AgentOrchestrator } from "@lifecycle/agents";
import type {
  LifecycleEvent,
  LifecycleEventKind,
  ProjectRecord,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { WorkspaceClient } from "@lifecycle/workspace";
import {
  createSqlCollection,
  createLocalOnlyRegistry,
  selectAllProjects,
  selectAllWorkspaces,
  selectAllServices,
  type ClientRegistry,
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
  agentOrchestrator: AgentOrchestrator;
  collections: StoreCollections;
  driver: SqlDriver;
  clientRegistry: ClientRegistry;
}

interface StoreProviderHotState {
  collections: StoreCollections;
  clientRegistry: ClientRegistry;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function createCollections(driver: SqlDriver): StoreCollections {
  return {
    projects: createSqlCollection<ProjectRecord>({
      id: "projects",
      driver,
      loadFn: selectAllProjects,
      getKey: (p) => p.id,
    }),
    workspaces: createSqlCollection<WorkspaceRecord>({
      id: "workspaces",
      driver,
      loadFn: selectAllWorkspaces,
      getKey: (w) => w.id,
    }),
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
      void collections.workspaces.refresh();
      if (event.kind === "workspace.archived") {
        void collections.services.refresh();
      }
      break;

    case "service.status.changed":
    case "service.process.exited":
      void collections.services.refresh();
      break;

    case "agent.session.created":
    case "agent.session.updated":
      // Agent sessions are loaded per-workspace on demand, not globally.
      // Components that need them use useAgentSessions(workspaceId).
      break;
  }
}

export function StoreProvider({
  agentOrchestrator,
  driver,
  client,
  children,
}: PropsWithChildren<{
  agentOrchestrator: AgentOrchestrator;
  driver: SqlDriver;
  client: WorkspaceClient;
}>) {
  const hotState = import.meta.hot?.data as StoreProviderHotState | undefined;
  const [collections] = useState(() => hotState?.collections ?? createCollections(driver));
  const [clientRegistry] = useState(
    () => hotState?.clientRegistry ?? createLocalOnlyRegistry(client),
  );

  if (import.meta.hot) {
    import.meta.hot.data.collections = collections;
    import.meta.hot.data.clientRegistry = clientRegistry;
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
    () => ({ agentOrchestrator, collections, driver, clientRegistry }),
    [agentOrchestrator, collections, driver, clientRegistry],
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

export function useAgentOrchestrator(): AgentOrchestrator {
  return useStoreContext().agentOrchestrator;
}
