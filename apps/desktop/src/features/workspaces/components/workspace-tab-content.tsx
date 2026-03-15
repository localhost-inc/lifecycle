import type { GitPullRequestSummary } from "@lifecycle/contracts";
import { Alert, AlertDescription, AlertTitle, Loading } from "@lifecycle/ui";
import { Suspense, lazy, useEffect, useRef } from "react";
import { markPerformance, measurePerformance } from "../../../lib/performance";
import { toErrorEnvelope } from "../../../lib/tauri-error";
import { useWorkspaceManifest, useWorkspaceSnapshot } from "../hooks";
import { hasBlockingQueryError, hasBlockingQueryLoad } from "../routes/workspace-route-query-state";

const WorkspaceLayout = lazy(async () => {
  const module = await import("./workspace-layout");
  return {
    default: module.WorkspaceLayout,
  };
});

interface WorkspaceTabContentProps {
  onCloseWorkspaceTab?: () => void;
  onOpenPullRequest?: (pullRequest: GitPullRequestSummary) => void;
  workspaceId: string;
}

export function WorkspaceTabContent({
  onCloseWorkspaceTab,
  onOpenPullRequest,
  workspaceId,
}: WorkspaceTabContentProps) {
  const workspaceSnapshotQuery = useWorkspaceSnapshot(workspaceId);
  const readyMeasuredRef = useRef(false);
  const workspace = workspaceSnapshotQuery.data?.workspace ?? null;
  const manifestQuery = useWorkspaceManifest(
    workspace?.id ?? null,
    workspace?.worktree_path ?? null,
  );

  useEffect(() => {
    readyMeasuredRef.current = false;
    markPerformance("workspace-route:start");
  }, [workspaceId]);

  useEffect(() => {
    if (readyMeasuredRef.current || !workspace || manifestQuery.status !== "ready") {
      return;
    }

    readyMeasuredRef.current = true;
    markPerformance("workspace-route:ready");
    measurePerformance("workspace-route", "workspace-route:start", "workspace-route:ready");
  }, [manifestQuery.status, workspace]);

  if (hasBlockingQueryError(workspaceSnapshotQuery)) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant="destructive">
          <AlertTitle>Failed to load workspace</AlertTitle>
          <AlertDescription>
            {toErrorEnvelope(workspaceSnapshotQuery.error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (hasBlockingQueryLoad(workspaceSnapshotQuery)) {
    return <Loading message="Loading workspace..." />;
  }

  if (!workspace) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--muted-foreground)]">Workspace not found.</p>
      </div>
    );
  }

  if (hasBlockingQueryLoad(manifestQuery)) {
    return <Loading message="Loading workspace..." />;
  }

  if (hasBlockingQueryError(manifestQuery)) {
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
    <Suspense fallback={<Loading message="Loading workspace..." />}>
      <WorkspaceLayout
        manifestStatus={manifestQuery.data ?? null}
        onCloseWorkspaceTab={onCloseWorkspaceTab}
        onOpenPullRequest={onOpenPullRequest}
        workspace={workspace}
        workspaceSnapshot={workspaceSnapshotQuery.data ?? null}
      />
    </Suspense>
  );
}
