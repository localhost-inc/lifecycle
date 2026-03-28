import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import type {
  LifecycleEvent,
  LifecycleEventKind,
  ProjectRecord,
  ServiceRecord,
  WorkspaceRecord,
} from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { previewUrlForService } from "@lifecycle/environment";
import {
  createProjectCollection,
  createServiceCollection,
  createWorkspaceCollection,
  selectServiceByWorkspaceAndName,
  selectServicesByWorkspace,
  type SqlCollection,
} from "@lifecycle/store";
import { workspaceHostLabel } from "@lifecycle/workspace";
import { subscribeToLifecycleEvents } from "@/features/events";
import { invokeTauri } from "@/lib/tauri-error";

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
let previewProxyPortPromise: Promise<number> | null = null;

async function getPreviewProxyPort(): Promise<number> {
  if (!isTauri()) {
    return 52300;
  }

  if (!previewProxyPortPromise) {
    previewProxyPortPromise = invokeTauri<number>("get_preview_proxy_port");
  }

  return previewProxyPortPromise;
}

function createCollections(driver: SqlDriver): StoreCollections {
  return {
    projects: createProjectCollection(driver),
    workspaces: createWorkspaceCollection(driver),
    services: createServiceCollection(driver),
  };
}

function createEphemeralId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function applyWorkspaceStatusEvent(
  collections: StoreCollections,
  event: Extract<LifecycleEvent, { kind: "workspace.status.changed" }>,
): Promise<void> {
  const current = collections.workspaces.get(event.workspaceId);
  if (!current) {
    return;
  }

  const nextWorktreePath =
    event.worktreePath === undefined ? current.worktree_path : event.worktreePath;
  const nextGitSha = event.gitSha === undefined ? current.git_sha : event.gitSha;
  const nextManifestFingerprint =
    event.manifestFingerprint === undefined
      ? (current.manifest_fingerprint ?? null)
      : event.manifestFingerprint;
  const nextFailedAt = event.status === "failed" ? (event.failedAt ?? event.occurredAt) : null;

  if (
    current.status === event.status &&
    current.failure_reason === event.failureReason &&
    current.worktree_path === nextWorktreePath &&
    current.git_sha === nextGitSha &&
    (current.manifest_fingerprint ?? null) === nextManifestFingerprint &&
    current.failed_at === nextFailedAt
  ) {
    return;
  }

  const transaction = collections.workspaces.update(event.workspaceId, (draft) => {
    draft.status = event.status;
    draft.failure_reason = event.failureReason;
    draft.failed_at = nextFailedAt;
    draft.updated_at = event.occurredAt;
    draft.last_active_at = event.occurredAt;
    draft.worktree_path = nextWorktreePath;
    draft.git_sha = nextGitSha;
    draft.manifest_fingerprint = nextManifestFingerprint;
  });
  await transaction.isPersisted.promise;
}

async function applyWorkspaceRenamedEvent(
  collections: StoreCollections,
  event: Extract<LifecycleEvent, { kind: "workspace.renamed" }>,
): Promise<void> {
  const current = collections.workspaces.get(event.workspaceId);
  if (!current) {
    return;
  }

  if (
    current.name === event.name &&
    current.source_ref === event.sourceRef &&
    current.worktree_path === event.worktreePath
  ) {
    return;
  }

  const transaction = collections.workspaces.update(event.workspaceId, (draft) => {
    draft.name = event.name;
    draft.source_ref = event.sourceRef;
    draft.worktree_path = event.worktreePath;
    draft.updated_at = event.occurredAt;
    draft.last_active_at = event.occurredAt;
  });
  await transaction.isPersisted.promise;
}

async function applyWorkspaceArchivedEvent(
  collections: StoreCollections,
  driver: SqlDriver,
  event: Extract<LifecycleEvent, { kind: "workspace.archived" }>,
): Promise<void> {
  const services = await selectServicesByWorkspace(driver, event.workspaceId);
  for (const service of services) {
    const transaction = collections.services.delete(service.id);
    await transaction.isPersisted.promise;
  }

  if (!collections.workspaces.get(event.workspaceId)) {
    return;
  }

  const transaction = collections.workspaces.delete(event.workspaceId);
  await transaction.isPersisted.promise;
}

async function applyServiceStatusEvent(
  collections: StoreCollections,
  driver: SqlDriver,
  event: Extract<LifecycleEvent, { kind: "service.status.changed" }>,
): Promise<void> {
  const current = await selectServiceByWorkspaceAndName(driver, event.workspaceId, event.name);
  const nextAssignedPort =
    event.assignedPort !== undefined
      ? event.assignedPort
      : event.status === "failed" || event.status === "stopped"
        ? null
        : (current?.assigned_port ?? null);
  const workspace = collections.workspaces.get(event.workspaceId);
  const previewProxyPort = nextAssignedPort !== null ? await getPreviewProxyPort() : null;
  const previewUrl =
    nextAssignedPort !== null && workspace && previewProxyPort !== null
      ? previewUrlForService(workspaceHostLabel(workspace), event.name, previewProxyPort)
      : null;

  if (current) {
    if (
      current.status === event.status &&
      current.status_reason === event.statusReason &&
      current.assigned_port === nextAssignedPort &&
      current.preview_url === previewUrl
    ) {
      return;
    }

    const transaction = collections.services.update(current.id, (draft) => {
      draft.status = event.status;
      draft.status_reason = event.statusReason;
      draft.assigned_port = nextAssignedPort;
      draft.preview_url = previewUrl;
      draft.updated_at = event.occurredAt;
    });
    await transaction.isPersisted.promise;
    return;
  }

  const transaction = collections.services.insert({
    id: createEphemeralId(),
    workspace_id: event.workspaceId,
    name: event.name,
    status: event.status,
    status_reason: event.statusReason,
    assigned_port: nextAssignedPort,
    preview_url: previewUrl,
    created_at: event.occurredAt,
    updated_at: event.occurredAt,
  });
  await transaction.isPersisted.promise;
}

async function applyEntityEvent(
  collections: StoreCollections,
  driver: SqlDriver,
  event: LifecycleEvent,
): Promise<void> {
  switch (event.kind) {
    case "workspace.status.changed":
      await applyWorkspaceStatusEvent(collections, event);
      return;

    case "workspace.renamed":
      await applyWorkspaceRenamedEvent(collections, event);
      return;

    case "workspace.archived":
      await applyWorkspaceArchivedEvent(collections, driver, event);
      return;

    case "service.status.changed":
      await applyServiceStatusEvent(collections, driver, event);
      return;

    case "service.process.exited":
      return;

    case "agent.session.created":
    case "agent.session.updated":
      // Agent sessions are loaded per-workspace on demand, not globally.
      // Components that need them use useAgentSessions(workspaceId).
      return;
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
      void applyEntityEvent(collections, driver, event);
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
  }, [collections, driver]);

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
