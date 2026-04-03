import { useAgentClientRegistry } from "@lifecycle/agents/react";
import type { AgentClient } from "@lifecycle/agents";
import type { StackClient } from "@lifecycle/stack";
import { useStackClientRegistry } from "@lifecycle/stack/react";
import {
  getManifestFingerprint,
  type RepositoryRecord,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import type { WorkspaceClient } from "@lifecycle/workspace";
import { useWorkspaceClientRegistry } from "@lifecycle/workspace/react";
import { Alert, AlertDescription, AlertTitle, Loading } from "@lifecycle/ui";
import { useEffect, useRef, useState } from "react";
import { reconcileWorkspaceServices } from "@lifecycle/store";
import { useQuery } from "@tanstack/react-query";
import { useSettings } from "@/features/settings/state/settings-context";
import { markPerformance, measurePerformance } from "@/lib/performance";
import { toErrorEnvelope } from "@/lib/tauri-error";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import { useStoreContext, useWorkspace } from "@/store";
import { WorkspaceNavBar } from "@/features/workspaces/navbar/workspace-nav-bar";
import { WorkspaceScope } from "@/features/workspaces/workspace-provider";
import { WorkspaceShell } from "./workspace-shell";

interface WorkspaceLoaderProps {
  onCloseTab?: () => void;
  repository: RepositoryRecord;
  workspaceId: string;
}

interface LoadedWorkspaceRouteProps extends WorkspaceLoaderProps {
  agentClient: AgentClient;
  stackClient: StackClient;
  workspace: WorkspaceRecord;
  workspaceClient: WorkspaceClient;
}

function LoadedWorkspaceRoute({
  agentClient,
  stackClient,
  onCloseTab,
  repository,
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
      const manifestStatus = await workspaceClient.readManifest(repository.path);
      const manifestFingerprint =
        manifestStatus.state === "valid"
          ? getManifestFingerprint(manifestStatus.result.config)
          : null;
      const baseRef = await workspaceClient.getGitCurrentBranch(repository.path);
      const ensuredWorkspace = await workspaceClient.ensureWorkspace({
        workspace,
        projectPath: repository.path,
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
      await reconcileWorkspaceServices({
        config: manifestStatus.state === "valid" ? manifestStatus.result.config : null,
        driver,
        occurredAt: ensuredWorkspace.updated_at,
        services: collections.services,
        workspaceId: ensuredWorkspace.id,
      });
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
  }, [collections, driver, repository, workspace, workspaceClient, worktreeRoot]);

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
    <WorkspaceScope
      agentClient={agentClient}
      stackClient={stackClient}
      workspaceClient={workspaceClient}
    >
      <div className="flex h-full min-h-0 flex-1 flex-col" data-slot="workspace-shell">
        <WorkspaceNavBar activeWorkspaceId={workspaceId} repositoryName={repository.name} />
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

export function WorkspaceLoader({ onCloseTab, repository, workspaceId }: WorkspaceLoaderProps) {
  const workspace = useWorkspace(workspaceId) ?? null;
  const workspaceClientRegistry = useWorkspaceClientRegistry();
  const stackClientRegistry = useStackClientRegistry();
  const agentClientRegistry = useAgentClientRegistry();

  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--muted-foreground)]">Workspace not found.</p>
      </div>
    );
  }

  const workspaceClient = workspaceClientRegistry.resolve(workspace.host);
  const stackClient = stackClientRegistry.resolve(workspace.host);
  const agentClient = agentClientRegistry.resolve(workspace.host);

  return (
    <LoadedWorkspaceRoute
      agentClient={agentClient}
      stackClient={stackClient}
      onCloseTab={onCloseTab}
      repository={repository}
      workspace={workspace}
      workspaceClient={workspaceClient}
      workspaceId={workspaceId}
    />
  );
}
