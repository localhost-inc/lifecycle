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
  TerminalRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { WorkspaceRuntime } from "@lifecycle/workspace";
import {
  createSqlCollection,
  createHostOnlyRegistry,
  selectAllProjects,
  selectAllWorkspaces,
  selectAllServices,
  selectAllTerminals,
  type RuntimeRegistry,
  type SqlCollection,
  type SqlDriver,
} from "@lifecycle/store";
import { subscribeToLifecycleEvents } from "@/features/events";

const ENTITY_EVENT_KINDS: LifecycleEventKind[] = [
  "workspace.status_changed",
  "workspace.renamed",
  "workspace.deleted",
  "service.status_changed",
  "service.process_exited",
  "terminal.created",
  "terminal.updated",
  "terminal.status_changed",
  "terminal.renamed",
  "agent.session.created",
  "agent.session.updated",
];

interface StoreCollections {
  projects: SqlCollection<ProjectRecord>;
  workspaces: SqlCollection<WorkspaceRecord>;
  services: SqlCollection<ServiceRecord>;
  terminals: SqlCollection<TerminalRecord>;
}

interface StoreContextValue {
  agentOrchestrator: AgentOrchestrator;
  collections: StoreCollections;
  driver: SqlDriver;
  runtimeRegistry: RuntimeRegistry;
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
    terminals: createSqlCollection<TerminalRecord>({
      id: "terminals",
      driver,
      loadFn: selectAllTerminals,
      getKey: (t) => t.id,
    }),
  };
}

function refreshForEvent(collections: StoreCollections, event: LifecycleEvent): void {
  switch (event.kind) {
    case "workspace.status_changed":
    case "workspace.renamed":
    case "workspace.deleted":
      void collections.workspaces.refresh();
      if (event.kind === "workspace.deleted") {
        void collections.services.refresh();
        void collections.terminals.refresh();
      }
      break;

    case "service.status_changed":
    case "service.process_exited":
      void collections.services.refresh();
      break;

    case "terminal.created":
    case "terminal.updated":
    case "terminal.status_changed":
    case "terminal.renamed":
      void collections.terminals.refresh();
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
  runtime,
  children,
}: PropsWithChildren<{ agentOrchestrator: AgentOrchestrator; driver: SqlDriver; runtime: WorkspaceRuntime }>) {
  const [collections] = useState(() => createCollections(driver));
  const [runtimeRegistry] = useState(() => createHostOnlyRegistry(runtime));

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
    () => ({ agentOrchestrator, collections, driver, runtimeRegistry }),
    [agentOrchestrator, collections, driver, runtimeRegistry],
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
