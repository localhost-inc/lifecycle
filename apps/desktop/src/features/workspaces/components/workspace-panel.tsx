import type { GitDiffScope, GitLogEntry } from "@lifecycle/contracts";
import { createPortal } from "react-dom";
import { useCallback, useState } from "react";
import type { ManifestStatus } from "../../projects/api/projects";
import { ServiceIndicator } from "./service-indicator";
import { SetupProgress } from "./setup-progress";
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
        <button
          type="button"
          onClick={handleRun}
          className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-foreground)] hover:brightness-110"
        >
          Run
        </button>
      )}
      {canStop && (
        <button
          type="button"
          onClick={handleStop}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)]"
        >
          Stop
        </button>
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
  const rightRailRoot =
    typeof document === "undefined" ? null : document.getElementById("workspace-right-rail");

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
              <div className="rounded-md border border-red-200 bg-red-50 p-4">
                <h3 className="text-sm font-semibold text-red-800">Workspace failed</h3>
                <p className="mt-1 text-sm text-red-700">{failureReason}</p>
              </div>
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
          <div className="mt-8 rounded-md border border-[var(--border)] bg-[var(--card)] p-6 text-center">
            <p className="text-sm font-medium text-[var(--foreground)]">No lifecycle.json found</p>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Add a <code className="font-mono">lifecycle.json</code> file to the project root to
              configure services and setup steps.
            </p>
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
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <h3 className="text-sm font-semibold text-red-800">Workspace failed</h3>
              <p className="mt-1 text-sm text-red-700">{failureReason}</p>
            </div>
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
