import {
  isRouteErrorResponse,
  useLoaderData,
  useRouteError,
  type LoaderFunctionArgs,
} from "react-router-dom";
import { listProjects, readManifest, type ManifestStatus } from "../../projects/api/projects";
import { getWorkspaceById, type WorkspaceRow } from "../api/workspaces";
import { WorkspacePanel } from "../components/workspace-panel";

export interface WorkspaceRouteLoaderData {
  workspace: WorkspaceRow;
  manifestStatus: ManifestStatus | null;
}

export async function workspaceRouteLoader({
  params,
}: LoaderFunctionArgs): Promise<WorkspaceRouteLoaderData> {
  const workspaceId = params.workspaceId;
  if (!workspaceId) {
    throw new Response("Workspace id is required", { status: 400 });
  }

  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    throw new Response("Workspace not found", { status: 404 });
  }

  const projects = await listProjects();
  const project = projects.find((item) => item.id === workspace.project_id) ?? null;
  const manifestStatus = project ? await readManifest(project.path) : null;

  return { workspace, manifestStatus };
}

export function WorkspaceRoute() {
  const { workspace, manifestStatus } = useLoaderData() as WorkspaceRouteLoaderData;

  return <WorkspacePanel workspace={workspace} manifestStatus={manifestStatus} />;
}

export function WorkspaceRouteError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return (
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-[var(--muted-foreground)]">Workspace not found.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <p className="text-sm text-red-600">
          {error.status} {error.statusText}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="text-sm text-red-600">Failed to load workspace.</p>
    </div>
  );
}
