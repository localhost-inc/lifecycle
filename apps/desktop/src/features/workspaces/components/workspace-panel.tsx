import {
  getManifestFingerprint,
  type GitLogEntry,
  type ServiceRecord,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import { Alert, AlertDescription, AlertTitle, EmptyState, SetupProgress } from "@lifecycle/ui";
import { FileJson } from "lucide-react";
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
  const status = workspace.status;
  const failureReason = workspace.failure_reason;
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
  const showMissingManifest = status === "sleeping" && !hasManifest;
  const showSetup = setupSteps.length > 0 && (status === "starting" || status === "failed");
  const isManifestStale =
    manifestState === "valid" &&
    manifestFingerprint !== null &&
    workspace.manifest_fingerprint !== null &&
    workspace.manifest_fingerprint !== undefined &&
    workspace.manifest_fingerprint !== manifestFingerprint;

  const hasNotices = showSetup || (status === "failed" && Boolean(failureReason));
  const handleOpenDiff = useCallback((filePath: string) => {
    setOpenDocumentRequest({
      focusPath: filePath,
      id: crypto.randomUUID(),
      type: "changes-diff",
    });
  }, []);
  const handleOpenCommitDiff = useCallback((entry: GitLogEntry) => {
    setOpenDocumentRequest({
      commit: entry,
      id: crypto.randomUUID(),
      type: "commit-diff",
    });
  }, []);

  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    setRightRailRoot(document.getElementById("workspace-right-rail"));
  }, [workspace.id]);

  const mainContent = supportsTerminalInteraction ? (
    <div className="flex min-h-0 flex-1 flex-col">
      {hasNotices && (
        <div className="border-b border-[var(--border)] bg-[var(--card)]/40 px-6 py-5">
          {showSetup && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                Setup
              </h3>
              <SetupProgress steps={setupSteps} />
            </div>
          )}

          {status === "failed" && failureReason && (
            <div className={showSetup ? "mt-6" : ""}>
              <Alert variant="destructive">
                <AlertTitle>Workspace failed</AlertTitle>
                <AlertDescription>{failureReason}</AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      )}
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
        {showMissingManifest && (
          <div>
            <EmptyState
              description="Add a lifecycle.json file to the project root to configure services and setup steps."
              icon={<FileJson />}
              title="No lifecycle.json found"
            />
          </div>
        )}

        {showSetup && (
          <div className="mt-8">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Setup
            </h3>
            <SetupProgress steps={setupSteps} />
          </div>
        )}

        {status === "failed" && failureReason && (
          <div className="mt-8">
            <Alert variant="destructive">
              <AlertTitle>Workspace failed</AlertTitle>
              <AlertDescription>{failureReason}</AlertDescription>
            </Alert>
          </div>
        )}
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
            onOpenCommitDiff={handleOpenCommitDiff}
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
          onOpenCommitDiff={handleOpenCommitDiff}
          services={services}
          workspace={workspace}
        />
      )}
    </div>
  );
}
