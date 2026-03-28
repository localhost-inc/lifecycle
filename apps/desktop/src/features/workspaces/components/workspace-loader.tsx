import {
  getManifestFingerprint,
  type LifecycleConfig,
  type ProjectRecord,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import { useAgentClientRegistry } from "@lifecycle/agents/react";
import type { AgentClient } from "@lifecycle/agents";
import type { WorkspaceClient } from "@lifecycle/workspace/client";
import { useWorkspaceClientRegistry } from "@lifecycle/workspace/client/react";
import { Alert, AlertDescription, AlertTitle, Loading } from "@lifecycle/ui";
import { useEffect, useRef, useState } from "react";
import { selectServicesByWorkspace } from "@lifecycle/store";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/features/settings/state/settings-context";
import { markPerformance, measurePerformance } from "@/lib/performance";
import { toErrorEnvelope } from "@/lib/tauri-error";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import { useStoreContext, useWorkspace } from "@/store";
import { WorkspaceNavBar } from "@/features/workspaces/navbar/workspace-nav-bar";
import { WorkspaceScope } from "@/features/workspaces/workspace-provider";
import { WorkspaceShell } from "./workspace-shell";

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function reconcileWorkspaceServices(
  collections: ReturnType<typeof useStoreContext>["collections"],
  driver: ReturnType<typeof useStoreContext>["driver"],
  workspaceId: string,
  config: LifecycleConfig | null,
  occurredAt: string,
): Promise<void> {
  const existing = await selectServicesByWorkspace(driver, workspaceId);
  const existingByName = new Map(existing.map((service) => [service.name, service]));
  const declaredServiceNames = config
    ? Object.entries(config.environment)
        .filter(([, node]) => node.kind === "service")
        .map(([name]) => name)
        .sort((left, right) => left.localeCompare(right))
    : [];
  const declaredServiceNameSet = new Set(declaredServiceNames);

  for (const service of existing) {
    if (declaredServiceNameSet.has(service.name)) {
      continue;
    }
    const transaction = collections.services.delete(service.id);
    await transaction.isPersisted.promise;
  }

  for (const serviceName of declaredServiceNames) {
    const current = existingByName.get(serviceName);
    if (current) {
      const transaction = collections.services.update(current.id, (draft) => {
        draft.status = "stopped";
        draft.status_reason = null;
        draft.assigned_port = null;
        draft.preview_url = null;
        draft.updated_at = occurredAt;
      });
      await transaction.isPersisted.promise;
      continue;
    }

    const transaction = collections.services.insert({
      id: createId(),
      workspace_id: workspaceId,
      name: serviceName,
      status: "stopped",
      status_reason: null,
      assigned_port: null,
      preview_url: null,
      created_at: occurredAt,
      updated_at: occurredAt,
    });
    await transaction.isPersisted.promise;
  }
}

interface WorkspaceLoaderProps {
  onCloseTab?: () => void;
  project: ProjectRecord;
  workspaceId: string;
}

interface LoadedWorkspaceRouteProps extends WorkspaceLoaderProps {
  agentClient: AgentClient;
  workspace: WorkspaceRecord;
  workspaceClient: WorkspaceClient;
}

function LoadedWorkspaceRoute({
  agentClient,
  onCloseTab,
  project,
  workspace,
  workspaceClient,
  workspaceId,
}: LoadedWorkspaceRouteProps) {
  const { collections, driver } = useStoreContext();
  const { worktreeRoot } = useSettings();
  const readyMeasuredRef = useRef(false);
  const [ensureError, setEnsureError] = useState<unknown>(null);
  const [ensuringWorkspace, setEnsuringWorkspace] = useState(false);
  const manifestQuery = useQuery({
    queryKey: workspaceKeys.manifest(workspace.id),
    queryFn: () => workspaceClient.readManifest(workspace.worktree_path!),
    enabled: workspace.worktree_path !== null && workspace.worktree_path !== undefined,
  });

  useEffect(() => {
    readyMeasuredRef.current = false;
    setEnsureError(null);
    setEnsuringWorkspace(false);
    markPerformance("workspace-route:start");
  }, [workspaceId]);

  useEffect(() => {
    if (workspace.status !== "provisioning") {
      return;
    }

    let cancelled = false;
    setEnsureError(null);
    setEnsuringWorkspace(true);

    void (async () => {
      const manifestStatus = await workspaceClient.readManifest(project.path);
      const manifestFingerprint =
        manifestStatus.state === "valid"
          ? getManifestFingerprint(manifestStatus.result.config)
          : null;
      const baseRef = await workspaceClient.getGitCurrentBranch(project.path);
      const ensuredWorkspace = await workspaceClient.ensureWorkspace({
        workspace,
        projectPath: project.path,
        baseRef,
        worktreeRoot,
        manifestFingerprint,
      });
      if (cancelled) {
        return;
      }

      const transaction = collections.workspaces.update(ensuredWorkspace.id, (draft) => {
        Object.assign(draft, ensuredWorkspace);
      });
      await transaction.isPersisted.promise;
      await reconcileWorkspaceServices(
        collections,
        driver,
        ensuredWorkspace.id,
        manifestStatus.state === "valid" ? manifestStatus.result.config : null,
        ensuredWorkspace.updated_at,
      );
    })()
      .catch((error) => {
        if (!cancelled) {
          setEnsureError(error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setEnsuringWorkspace(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [collections, driver, project, workspace, workspaceClient, worktreeRoot]);

  useEffect(() => {
    if (readyMeasuredRef.current || !workspace || manifestQuery.status !== "success") {
      return;
    }

    readyMeasuredRef.current = true;
    markPerformance("workspace-route:ready");
    measurePerformance("workspace-route", "workspace-route:start", "workspace-route:ready");
  }, [manifestQuery.status, workspace]);

  if (ensureError) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant="destructive">
          <AlertTitle>Failed to prepare workspace</AlertTitle>
          <AlertDescription>{toErrorEnvelope(ensureError).message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (workspace.status === "failed") {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant="destructive">
          <AlertTitle>Workspace provisioning failed</AlertTitle>
          <AlertDescription>
            {workspace.failure_reason ?? "The workspace could not be prepared."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (ensuringWorkspace || workspace.status === "provisioning") {
    return <Loading message="Preparing workspace..." />;
  }

  if (manifestQuery.isLoading && manifestQuery.data === undefined) {
    return <Loading message="Loading workspace..." />;
  }

  if (manifestQuery.error && manifestQuery.data === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant="destructive">
          <AlertTitle>Failed to load manifest</AlertTitle>
          <AlertDescription>{toErrorEnvelope(manifestQuery.error).message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <WorkspaceScope agentClient={agentClient} workspaceClient={workspaceClient}>
      <div className="flex h-full min-h-0 flex-1 flex-col" data-slot="workspace-shell">
        <WorkspaceNavBar activeWorkspaceId={workspaceId} projectName={project.name} />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <WorkspaceShell
            manifestStatus={manifestQuery.data ?? null}
            onCloseTab={onCloseTab}
            workspace={workspace}
          />
        </div>
      </div>
    </WorkspaceScope>
  );
}

export function WorkspaceLoader({ onCloseTab, project, workspaceId }: WorkspaceLoaderProps) {
  const workspace = useWorkspace(workspaceId) ?? null;
  const workspaceClientRegistry = useWorkspaceClientRegistry();
  const agentClientRegistry = useAgentClientRegistry();

  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--muted-foreground)]">Workspace not found.</p>
      </div>
    );
  }

  const workspaceClient = workspaceClientRegistry.resolve(workspace.host);
  const agentClient = agentClientRegistry.resolve(workspace.host);

  return (
    <LoadedWorkspaceRoute
      agentClient={agentClient}
      onCloseTab={onCloseTab}
      project={project}
      workspace={workspace}
      workspaceClient={workspaceClient}
      workspaceId={workspaceId}
    />
  );
}
