import { Alert, AlertDescription, AlertTitle, Loading } from "@lifecycle/ui";
import { Suspense, lazy, useEffect, useRef } from "react";
import { markPerformance, measurePerformance } from "@/lib/performance";
import { toErrorEnvelope } from "@/lib/tauri-error";
import { useWorkspace, useWorkspaceManifest } from "@/features/workspaces/hooks";
import { hasBlockingQueryError, hasBlockingQueryLoad } from "@/features/workspaces/routes/workspace-route-query-state";

const WorkspaceLayout = lazy(async () => {
  const module = await import("./workspace-layout");
  return {
    default: module.WorkspaceLayout,
  };
});

interface WorkspaceTabContentProps {
  onCloseWorkspaceTab?: () => void;
  workspaceId: string;
}

export function WorkspaceTabContent({
  onCloseWorkspaceTab,
  workspaceId,
}: WorkspaceTabContentProps) {
  const workspaceQuery = useWorkspace(workspaceId);
  const readyMeasuredRef = useRef(false);
  const workspace = workspaceQuery.data ?? null;
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

  if (hasBlockingQueryError(workspaceQuery)) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant="destructive">
          <AlertTitle>Failed to load workspace</AlertTitle>
          <AlertDescription>{toErrorEnvelope(workspaceQuery.error).message}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (hasBlockingQueryLoad(workspaceQuery)) {
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
        workspace={workspace}
      />
    </Suspense>
  );
}
