import { useParams } from "react-router-dom";
import { useProjectManifest } from "../../projects/hooks";
import { useWorkspace } from "../hooks";
import { WorkspacePanel } from "../components/workspace-panel";

export function WorkspaceRoute() {
  const { workspaceId } = useParams();
  const workspaceQuery = useWorkspace(workspaceId ?? null);
  const manifestQuery = useProjectManifest(workspaceQuery.data?.project_id ?? null);

  if (workspaceQuery.error) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-red-600">
          Failed to load workspace: {String(workspaceQuery.error)}
        </p>
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
        <p className="text-sm text-red-600">
          Failed to load manifest: {String(manifestQuery.error)}
        </p>
      </div>
    );
  }

  return (
    <WorkspacePanel workspace={workspaceQuery.data} manifestStatus={manifestQuery.data ?? null} />
  );
}
