import { useParams } from "react-router-dom";
import { WorkspaceNavBar } from "@/features/projects/components/workspace-nav-bar";
import { WorkspaceTabContent } from "@/features/workspaces/components/workspace-tab-content";
import { useProject } from "@/store/hooks";

export function WorkspaceRoute() {
  const { projectId, workspaceId } = useParams();
  const project = useProject(projectId ?? null);

  if (!workspaceId || !project) {
    return null;
  }

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col bg-[var(--background)]"
      data-slot="workspace-shell"
    >
      <WorkspaceNavBar
        activeWorkspaceId={workspaceId}
        projectName={project.name}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-tl-lg border-l border-t border-[var(--border)] bg-[var(--surface)]">
        <WorkspaceTabContent workspaceId={workspaceId} />
      </div>
    </div>
  );
}
