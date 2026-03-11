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
import { useCallback, useLayoutEffect, useState } from "react";
import type { ManifestStatus } from "../../projects/api/projects";
import { useQueryClient } from "../../../query";
import type { OpenDocumentRequest } from "./workspace-surface-logic";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceSurface } from "./workspace-surface";
import { startServices, stopWorkspace, updateWorkspaceService } from "../api";
import { useWorkspaceServices, useWorkspaceSetup, workspaceKeys } from "../hooks";
import { workspaceSupportsFilesystemInteraction } from "../lib/workspace-capabilities";

interface WorkspacePanelProps {
  workspace: WorkspaceRecord;
  manifestStatus: ManifestStatus | null;
}

export function WorkspacePanel({ workspace, manifestStatus }: WorkspacePanelProps) {
  const client = useQueryClient();
  const [rightRailRoot, setRightRailRoot] = useState<HTMLElement | null>(null);
  const [openDocumentRequest, setOpenDocumentRequest] = useState<OpenDocumentRequest | null>(null);
  const hasManifest = manifestStatus?.state === "valid";
  const config = hasManifest ? manifestStatus.result.config : null;
  const manifestState = manifestStatus?.state ?? "missing";
  const manifestFingerprint = config ? getManifestFingerprint(config) : null;
  const servicesQuery = useWorkspaceServices(workspace.id);
  const setupQuery = useWorkspaceSetup(workspace.id);
  const services = servicesQuery.data ?? [];
  const setupSteps = setupQuery.data ?? [];

  const handleRun = useCallback(async () => {
    if (!config) return;
    try {
      const manifestJson = JSON.stringify(config);
      await startServices(workspace.id, manifestJson, getManifestFingerprint(config));
    } catch (err) {
      console.error("Failed to start services:", err);
      throw err;
    }
  }, [workspace.id, config]);

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
        client.invalidate(workspaceKeys.services(workspace.id));
      } catch (err) {
        console.error("Failed to update workspace service:", err);
        throw err;
      }
    },
    [client, workspace.id],
  );

  const supportsTerminalInteraction = workspaceSupportsFilesystemInteraction(workspace);
  const isManifestStale =
    manifestState === "valid" &&
    manifestFingerprint !== null &&
    workspace.manifest_fingerprint !== null &&
    workspace.manifest_fingerprint !== undefined &&
    workspace.manifest_fingerprint !== manifestFingerprint;

  const handleOpenDiff = useCallback((filePath: string) => {
    setOpenDocumentRequest({
      focusPath: filePath,
      id: crypto.randomUUID(),
      kind: "changes-diff",
    });
  }, []);
  const handleOpenFile = useCallback((filePath: string) => {
    setOpenDocumentRequest({
      filePath,
      id: crypto.randomUUID(),
      kind: "file-viewer",
    });
  }, []);
  const handleOpenCommitDiff = useCallback((entry: GitLogEntry) => {
    setOpenDocumentRequest({
      commit: entry,
      id: crypto.randomUUID(),
      kind: "commit-diff",
    });
  }, []);
  const handleOpenPullRequest = useCallback(
    (pullRequest: GitPullRequestSummary) => {
      if (!supportsTerminalInteraction) {
        openUrl(pullRequest.url);
        return;
      }

      setOpenDocumentRequest({
        id: crypto.randomUUID(),
        pullRequest,
        kind: "pull-request",
      });
    },
    [supportsTerminalInteraction],
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
            hasManifest={hasManifest}
            isManifestStale={isManifestStale}
            manifestState={manifestState}
            onRun={handleRun}
            onStop={handleStop}
            onUpdateService={handleUpdateService}
            onOpenDiff={handleOpenDiff}
            onOpenFile={handleOpenFile}
            onOpenCommitDiff={handleOpenCommitDiff}
            onOpenPullRequest={handleOpenPullRequest}
            setupSteps={setupSteps}
            services={services}
            workspace={workspace}
          />,
          rightRailRoot,
        )
      ) : (
        <WorkspaceSidebar
          hasManifest={hasManifest}
          isManifestStale={isManifestStale}
          manifestState={manifestState}
          onRun={handleRun}
          onStop={handleStop}
          onUpdateService={handleUpdateService}
          onOpenDiff={handleOpenDiff}
          onOpenFile={handleOpenFile}
          onOpenCommitDiff={handleOpenCommitDiff}
          onOpenPullRequest={handleOpenPullRequest}
          setupSteps={setupSteps}
          services={services}
          workspace={workspace}
        />
      )}
    </div>
  );
}
