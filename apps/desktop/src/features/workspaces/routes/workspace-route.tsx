import { Alert, AlertDescription, AlertTitle } from "@lifecycle/ui";
import { useParams } from "react-router-dom";
import { useProjectManifest } from "../../projects/hooks";
import { WorkspacePanel } from "../components/workspace-panel";
import { useWorkspace } from "../hooks";

export function WorkspaceRoute() {
  const { workspaceId } = useParams();
  const workspaceQuery = useWorkspace(workspaceId ?? null);
  const manifestQuery = useProjectManifest(workspaceQuery.data?.project_id ?? null);

  if (workspaceQuery.error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Alert className="max-w-lg" variant="destructive">
          <AlertTitle>Failed to load workspace</AlertTitle>
          <AlertDescription>{String(workspaceQuery.error)}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (workspaceQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--muted-foreground)]">Loading workspace...</p>
      </div>
    );
  }

  if (!workspaceQuery.data) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--muted-foreground)]">Workspace not found.</p>
      </div>
    );
  }

  if (manifestQuery.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-[var(--muted-foreground)]">Loading workspace...</p>
      </div>
    );
  }

  if (manifestQuery.error) {
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
    <WorkspacePanel workspace={workspaceQuery.data} manifestStatus={manifestQuery.data ?? null} />
  );
}
