import { getManifestFingerprint } from "@lifecycle/contracts";
import { Alert, AlertDescription, AlertTitle, Loading } from "@lifecycle/ui";
import { useEffect, useRef, useState } from "react";
import { useOptionalWorkspaceHostClient } from "@lifecycle/workspace/client/react";
import { getCurrentBranch } from "@/features/projects/api/current-branch";
import { readManifest } from "@/features/projects/api/projects";
import { useSettings } from "@/features/settings/state/settings-context";
import { markPerformance, measurePerformance } from "@/lib/performance";
import { toErrorEnvelope } from "@/lib/tauri-error";
import { useWorkspace, useWorkspaceManifest } from "@/features/workspaces/hooks";
import { useProject, useStoreContext } from "@/store";
import { WorkspaceShell } from "./workspace-shell";

interface WorkspaceLoaderProps {
  onCloseTab?: () => void;
  workspaceId: string;
}

export function WorkspaceLoader({ onCloseTab, workspaceId }: WorkspaceLoaderProps) {
  const { collections } = useStoreContext();
  const { worktreeRoot } = useSettings();
  const workspace = useWorkspace(workspaceId) ?? null;
  const project = useProject(workspace?.project_id ?? null) ?? null;
  const workspaceHostClient = useOptionalWorkspaceHostClient(workspace?.host);
  const readyMeasuredRef = useRef(false);
  const [ensureError, setEnsureError] = useState<unknown>(null);
  const [ensuringWorkspace, setEnsuringWorkspace] = useState(false);
  const manifestQuery = useWorkspaceManifest(
    workspace?.id ?? null,
    workspace?.worktree_path ?? null,
  );

  useEffect(() => {
    readyMeasuredRef.current = false;
    setEnsureError(null);
    setEnsuringWorkspace(false);
    markPerformance("workspace-route:start");
  }, [workspaceId]);

  useEffect(() => {
    if (
      workspace === null ||
      project === null ||
      workspaceHostClient === null ||
      workspace.status !== "provisioning"
    ) {
      return;
    }

    let cancelled = false;
    setEnsureError(null);
    setEnsuringWorkspace(true);

    void (async () => {
      const manifestStatus = await readManifest(project.path);
      const manifestJson =
        manifestStatus.state === "valid" ? JSON.stringify(manifestStatus.result.config) : undefined;
      const manifestFingerprint =
        manifestStatus.state === "valid"
          ? getManifestFingerprint(manifestStatus.result.config)
          : null;
      const baseRef = await getCurrentBranch(project.path);
      const ensuredWorkspace = await workspaceHostClient.ensureWorkspace({
        workspace,
        projectPath: project.path,
        baseRef,
        worktreeRoot,
        manifestJson,
        manifestFingerprint,
      });
      if (cancelled) {
        return;
      }

      const transaction = collections.workspaces.update(ensuredWorkspace.id, (draft) => {
        Object.assign(draft, ensuredWorkspace);
      });
      await transaction.isPersisted.promise;
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
  }, [collections.workspaces, project, workspace, workspaceHostClient, worktreeRoot]);

  useEffect(() => {
    if (readyMeasuredRef.current || !workspace || manifestQuery.status !== "success") {
      return;
    }

    readyMeasuredRef.current = true;
    markPerformance("workspace-route:ready");
    measurePerformance("workspace-route", "workspace-route:start", "workspace-route:ready");
  }, [manifestQuery.status, workspace]);

  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--muted-foreground)]">Workspace not found.</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--muted-foreground)]">Project not found.</p>
      </div>
    );
  }

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
    <WorkspaceShell
      manifestStatus={manifestQuery.data ?? null}
      onCloseTab={onCloseTab}
      workspace={workspace}
    />
  );
}
