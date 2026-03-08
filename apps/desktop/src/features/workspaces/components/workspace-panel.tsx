import type { GitDiffScope, GitLogEntry } from "@lifecycle/contracts";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  EmptyState,
  SetupProgress,
} from "@lifecycle/ui";
import { FileJson } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useLayoutEffect, useState } from "react";
import type { ManifestStatus } from "../../projects/api/projects";
import { ServiceIndicator } from "./service-indicator";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceSurface } from "./workspace-surface";
import type { WorkspaceRow } from "../api";
import { startServices, stopWorkspace } from "../api";
import { useWorkspaceServices, useWorkspaceSetup } from "../hooks";

interface WorkspacePanelProps {
  workspace: WorkspaceRow;
  manifestStatus: ManifestStatus | null;
}

export function workspaceSupportsTerminalInteraction(
  workspace: Pick<WorkspaceRow, "status" | "worktree_path">,
): boolean {
  return (
    workspace.worktree_path !== null &&
    workspace.status !== "creating" &&
    workspace.status !== "destroying"
  );
}

export function WorkspacePanel({ workspace, manifestStatus }: WorkspacePanelProps) {
  const [rightRailRoot, setRightRailRoot] = useState<HTMLElement | null>(null);
  const [openDocumentRequest, setOpenDocumentRequest] = useState<
    | {
        filePath: string;
        id: string;
        kind: "file-diff";
        scope: GitDiffScope;
      }
    | {
        commit: GitLogEntry;
        id: string;
        kind: "commit-diff";
      }
    | null
  >(null);
  const hasManifest = manifestStatus?.state === "valid";
  const config = hasManifest ? manifestStatus.result.config : null;
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
      await startServices(workspace.id, manifestJson);
    } catch (err) {
      console.error("Failed to start services:", err);
    }
  }, [workspace.id, config]);

  const handleStop = useCallback(async () => {
    try {
      await stopWorkspace(workspace.id);
    } catch (err) {
      console.error("Failed to stop workspace:", err);
    }
  }, [workspace.id]);

  const supportsTerminalInteraction = workspaceSupportsTerminalInteraction(workspace);
  const canRun = (status === "sleeping" || status === "failed") && hasManifest;
  const canStop = status === "ready";
  const showMissingManifest = status === "sleeping" && !hasManifest;
  const showSetup = setupSteps.length > 0 && (status === "starting" || status === "failed");
  const showServices = services.length > 0 && status !== "ready";

  const actionButtons = (
    <div className="flex items-center gap-2">
      {canRun && (
        <Button className="px-3 py-1.5" onClick={handleRun}>
          Run
        </Button>
      )}
      {canStop && (
        <Button className="px-3 py-1.5" onClick={handleStop} variant="outline">
          Stop
        </Button>
      )}
    </div>
  );

  const hasNotices = showSetup || showServices || (status === "failed" && Boolean(failureReason));
  const handleOpenDiff = useCallback((filePath: string, scope: GitDiffScope) => {
    setOpenDocumentRequest({
      filePath,
      id: crypto.randomUUID(),
      kind: "file-diff",
      scope,
    });
  }, []);
  const handleOpenCommitDiff = useCallback((entry: GitLogEntry) => {
    setOpenDocumentRequest({
      commit: entry,
      id: crypto.randomUUID(),
      kind: "commit-diff",
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

          {showServices && (
            <div className={showSetup ? "mt-6" : ""}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                Services
              </h3>
              <div className="space-y-2">
                {services.map((svc) => (
                  <ServiceIndicator key={svc.service_name} service={svc} />
                ))}
              </div>
            </div>
          )}

          {status === "failed" && failureReason && (
            <div className={showSetup || showServices ? "mt-6" : ""}>
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
        {actionButtons}

        {showMissingManifest && (
          <div className="mt-8">
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

        {showServices && (
          <div className="mt-8">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              Services
            </h3>
            <div className="space-y-2">
              {services.map((svc) => (
                <ServiceIndicator key={svc.service_name} service={svc} />
              ))}
            </div>
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
          onOpenDiff={handleOpenDiff}
          onOpenCommitDiff={handleOpenCommitDiff}
          services={services}
          workspace={workspace}
        />
      )}
    </div>
  );
}
