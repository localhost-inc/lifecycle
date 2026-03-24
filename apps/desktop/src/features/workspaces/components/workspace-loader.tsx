import { Alert, AlertDescription, AlertTitle, Loading } from "@lifecycle/ui";
import { Suspense, lazy, useEffect, useRef } from "react";
import { markPerformance, measurePerformance } from "@/lib/performance";
import { toErrorEnvelope } from "@/lib/tauri-error";
import { useWorkspace, useWorkspaceManifest } from "@/features/workspaces/hooks";

const WorkspaceShell = lazy(async () => {
  const module = await import("./workspace-shell");
  return {
    default: module.WorkspaceShell,
  };
});

interface WorkspaceLoaderProps {
  onCloseWorkspaceTab?: () => void;
  workspaceId: string;
}

export function WorkspaceLoader({
  onCloseWorkspaceTab,
  workspaceId,
}: WorkspaceLoaderProps) {
  const workspace = useWorkspace(workspaceId) ?? null;
  const readyMeasuredRef = useRef(false);
  const manifestQuery = useWorkspaceManifest(
    workspace?.id ?? null,
    workspace?.worktree_path ?? null,
  );

  useEffect(() => {
    readyMeasuredRef.current = false;
    markPerformance("workspace-route:start");
  }, [workspaceId]);

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
    <Suspense fallback={<Loading message="Loading workspace..." />}>
      <WorkspaceShell
        manifestStatus={manifestQuery.data ?? null}
        onCloseWorkspaceTab={onCloseWorkspaceTab}
        workspace={workspace}
      />
    </Suspense>
  );
}
