import { useMemo } from "react";
import type { ProjectRecord } from "@lifecycle/contracts";
import type { ManifestStatus } from "@lifecycle/workspace";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useWorkspaceClientRegistry } from "@lifecycle/workspace/react";
import { useProjects } from "@/store";

export interface ProjectCatalog {
  manifestsByProjectId: Record<string, ManifestStatus>;
  projects: ProjectRecord[];
}

export const projectKeys = {
  catalog: () => ["project-catalog"] as const,
  manifest: (projectId: string) => ["project-manifest", projectId] as const,
};

/**
 * Returns the project catalog: projects from TanStack DB + manifests from React Query.
 * Projects come from the store (entity data), manifests are fetched via React Query.
 */
export function useProjectCatalog(): {
  data: ProjectCatalog | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const projects = useProjects();
  const localWorkspaceClient = useWorkspaceClientRegistry().resolve("local");

  const manifestsQuery = useQuery({
    queryKey: projectKeys.catalog(),
    queryFn: async () => {
      const manifestEntries = await Promise.all(
        projects.map(
          async (project) =>
            [project.id, await localWorkspaceClient.readManifest(project.path)] as const,
        ),
      );
      return Object.fromEntries(manifestEntries) as Record<string, ManifestStatus>;
    },
  });

  const data = useMemo(() => {
    if (!manifestsQuery.data) {
      return undefined;
    }
    return {
      manifestsByProjectId: manifestsQuery.data,
      projects,
    };
  }, [manifestsQuery.data, projects]);

  return {
    data,
    isLoading: manifestsQuery.isLoading,
    error: manifestsQuery.error,
  };
}

export function useProjectManifest(
  projectId: string | null,
): UseQueryResult<ManifestStatus | null> {
  const enabled = projectId !== null;
  const projects = useProjects();
  const localWorkspaceClient = useWorkspaceClientRegistry().resolve("local");

  return useQuery({
    queryKey: projectId ? projectKeys.manifest(projectId) : ["project-manifest", "disabled"],
    queryFn: async () => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) {
        return null;
      }
      return localWorkspaceClient.readManifest(project.path);
    },
    enabled,
  });
}
