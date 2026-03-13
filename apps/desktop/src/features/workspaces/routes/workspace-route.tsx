import { Alert, AlertDescription, AlertTitle, Loading } from "@lifecycle/ui";
import { lazy, Suspense, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { markPerformance, measurePerformance } from "../../../lib/performance";
import { useWorkspaceManifest, useWorkspaceSnapshot } from "../hooks";
import { hasBlockingQueryError, hasBlockingQueryLoad } from "./workspace-route-query-state";

const WorkspacePanel = lazy(async () => {
  const module = await import("../components/workspace-panel");
  return {
    default: module.WorkspacePanel,
  };
});

export function WorkspaceRoute() {
  const { workspaceId } = useParams();
  const workspaceSnapshotQuery = useWorkspaceSnapshot(workspaceId ?? null);
  const readyMeasuredRef = useRef(false);
  const workspace = workspaceSnapshotQuery.data?.workspace ?? null;
  const manifestQuery = useWorkspaceManifest(
    workspace?.id ?? null,
    workspace?.worktree_path ?? null,
  );

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

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
          <AlertDescription>{String(workspaceSnapshotQuery.error)}</AlertDescription>
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
          <AlertDescription>{String(manifestQuery.error)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <Suspense fallback={<Loading message="Loading workspace..." />}>
      <WorkspacePanel
        manifestStatus={manifestQuery.data ?? null}
        workspace={workspace}
        workspaceSnapshot={workspaceSnapshotQuery.data ?? null}
      />
    </Suspense>
  );
}
