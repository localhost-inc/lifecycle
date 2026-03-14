import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getManifestFingerprint,
  type GitLogEntry,
  type GitPullRequestSummary,
  type ServiceRecord,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ManifestStatus } from "../../projects/api/projects";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceSurface } from "./workspace-surface";
import {
  syncWorkspaceManifest,
  startServices,
  stopWorkspace,
  updateWorkspaceService,
  type WorkspaceSnapshotResult,
} from "../api";
import { useWorkspaceEnvironmentTasks, useWorkspaceSetup } from "../hooks";
import { workspaceSupportsFilesystemInteraction } from "../lib/workspace-capabilities";
import { readWorkspaceRouteState, updateWorkspaceRouteState } from "../lib/workspace-route-state";
import { shouldSyncWorkspaceManifest } from "../lib/workspace-manifest-sync";
import { useWorkspaceOpenRequests } from "../state/workspace-open-requests";

interface WorkspacePanelProps {
  workspace: WorkspaceRecord;
  workspaceSnapshot: WorkspaceSnapshotResult | null;
  manifestStatus: ManifestStatus | null;
  onOpenPullRequest?: (pullRequest: GitPullRequestSummary) => void;
}

export function WorkspacePanel({
  workspace,
  workspaceSnapshot,
  manifestStatus,
  onOpenPullRequest,
}: WorkspacePanelProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rightRailRoot, setRightRailRoot] = useState<HTMLElement | null>(null);
  const { clearDocumentRequest, openDocument, requestsByWorkspaceId } = useWorkspaceOpenRequests();
  const openDocumentRequest = requestsByWorkspaceId[workspace.id] ?? null;
  const hasManifest = manifestStatus?.state === "valid";
  const config = hasManifest ? manifestStatus.result.config : null;
  const manifestState = manifestStatus?.state ?? "missing";
  const manifestFingerprint = config ? getManifestFingerprint(config) : null;
  const environmentTasksQuery = useWorkspaceEnvironmentTasks(workspace.id);
  const setupQuery = useWorkspaceSetup(workspace.id);
  const services = workspaceSnapshot?.services ?? [];
  const terminals = workspaceSnapshot?.terminals ?? [];
  const environmentTasks = environmentTasksQuery.data ?? [];
  const setupSteps = setupQuery.data ?? [];
  const routeState = useMemo(() => readWorkspaceRouteState(searchParams), [searchParams]);
  const supportsTerminalInteraction = workspaceSupportsFilesystemInteraction(workspace);

  const handleRun = useCallback(async () => {
    if (!config) return;
    try {
      const manifestJson = JSON.stringify(config);
      await startServices({
        workspace,
        services,
        manifestJson,
        manifestFingerprint: getManifestFingerprint(config),
      });
    } catch (err) {
      console.error("Failed to start services:", err);
      throw err;
    }
  }, [config, services, workspace]);

  const handleRestart = useCallback(async () => {
    if (!config) {
      return;
    }

    try {
      const manifestJson = JSON.stringify(config);
      await stopWorkspace(workspace.id);
      await startServices({
        workspace,
        services,
        manifestJson,
        manifestFingerprint: getManifestFingerprint(config),
      });
    } catch (err) {
      console.error("Failed to restart workspace:", err);
      throw err;
    }
  }, [config, services, workspace]);

  const handleStop = useCallback(async () => {
    try {
      await stopWorkspace(workspace.id);
    } catch (err) {
      console.error("Failed to stop workspace:", err);
      throw err;
    }
  }, [workspace.id]);

  const handleUpdateService = useCallback(
    async ({
      exposure,
      portOverride,
      serviceName,
    }: {
      exposure: ServiceRecord["exposure"];
      portOverride: number | null;
      serviceName: string;
    }) => {
      try {
        await updateWorkspaceService(workspace.id, serviceName, { exposure, portOverride });
      } catch (err) {
        console.error("Failed to update workspace service:", err);
        throw err;
      }
    },
    [workspace.id],
  );

  const isManifestStale =
    manifestState === "valid" &&
    manifestFingerprint !== null &&
    workspace.manifest_fingerprint !== null &&
    workspace.manifest_fingerprint !== undefined &&
    workspace.manifest_fingerprint !== manifestFingerprint;

  useEffect(() => {
    if (!shouldSyncWorkspaceManifest(workspace, manifestStatus, services.length)) {
      return;
    }

    const configToSync = manifestStatus?.state === "valid" ? manifestStatus.result.config : null;
    void (async () => {
      try {
        await syncWorkspaceManifest(workspace.id, configToSync);
      } catch (error) {
        console.error("Failed to sync workspace manifest:", error);
      }
    })();
  }, [manifestStatus, services.length, workspace]);

  const updateRoute = useCallback(
    (patch: Parameters<typeof updateWorkspaceRouteState>[1]) => {
      const nextSearchParams = updateWorkspaceRouteState(searchParams, patch);
      if (nextSearchParams.toString() === searchParams.toString()) {
        return;
      }

      setSearchParams(nextSearchParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleOpenDiff = useCallback(
    (filePath: string) => {
      openDocument(workspace.id, {
        focusPath: filePath,
        id: crypto.randomUUID(),
        kind: "changes-diff",
      });
    },
    [openDocument, workspace.id],
  );
  const handleOpenFile = useCallback(
    (filePath: string) => {
      openDocument(workspace.id, {
        filePath,
        id: crypto.randomUUID(),
        kind: "file-viewer",
      });
    },
    [openDocument, workspace.id],
  );
  const handleOpenCommitDiff = useCallback(
    (entry: GitLogEntry) => {
      openDocument(workspace.id, {
        commit: entry,
        id: crypto.randomUUID(),
        kind: "commit-diff",
      });
    },
    [openDocument, workspace.id],
  );
  const handleOpenPullRequest = useCallback(
    (pullRequest: GitPullRequestSummary) => {
      if (onOpenPullRequest) {
        onOpenPullRequest(pullRequest);
        return;
      }

      if (!supportsTerminalInteraction) {
        openUrl(pullRequest.url);
        return;
      }
    },
    [onOpenPullRequest, supportsTerminalInteraction],
  );

  const handleGitTabChange = useCallback(
    (gitTab: ReturnType<typeof readWorkspaceRouteState>["gitTab"]) => {
      updateRoute({ gitTab });
    },
    [updateRoute],
  );

  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    setRightRailRoot(document.getElementById("workspace-right-rail"));
  }, [workspace.id]);

  const mainContent = supportsTerminalInteraction ? (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col">
        <WorkspaceSurface
          key={workspace.id}
          openDocumentRequest={openDocumentRequest}
          onOpenDocumentRequestHandled={(requestId) =>
            clearDocumentRequest(workspace.id, requestId)
          }
          snapshotTerminals={terminals}
          workspaceId={workspace.id}
        />
      </div>
    </div>
  ) : (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl">
        <EmptyState
          description="Use the Environment panel for lifecycle state and setup details until this workspace exposes an interactive surface."
          title="Workspace surface unavailable"
        />
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">{mainContent}</div>
      {rightRailRoot ? (
        createPortal(
          <WorkspaceSidebar
            activeGitTab={routeState.gitTab}
            config={config}
            hasManifest={hasManifest}
            isManifestStale={isManifestStale}
            manifestState={manifestState}
            onActiveGitTabChange={handleGitTabChange}
            onRestart={handleRestart}
            onRun={handleRun}
            onStop={handleStop}
            onUpdateService={handleUpdateService}
            onOpenDiff={handleOpenDiff}
            onOpenFile={handleOpenFile}
            onOpenCommitDiff={handleOpenCommitDiff}
            onOpenPullRequest={handleOpenPullRequest}
            environmentTasks={environmentTasks}
            setupSteps={setupSteps}
            services={services}
            workspace={workspace}
          />,
          rightRailRoot,
        )
      ) : (
        <WorkspaceSidebar
          activeGitTab={routeState.gitTab}
          config={config}
          hasManifest={hasManifest}
          isManifestStale={isManifestStale}
          manifestState={manifestState}
          onActiveGitTabChange={handleGitTabChange}
          onRestart={handleRestart}
          onRun={handleRun}
          onStop={handleStop}
          onUpdateService={handleUpdateService}
          onOpenDiff={handleOpenDiff}
          onOpenFile={handleOpenFile}
          onOpenCommitDiff={handleOpenCommitDiff}
          onOpenPullRequest={handleOpenPullRequest}
          environmentTasks={environmentTasks}
          setupSteps={setupSteps}
          services={services}
          workspace={workspace}
        />
      )}
    </div>
  );
}
