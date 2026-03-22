import { useMemo } from "react";
import type { ProjectRecord } from "@lifecycle/contracts";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { ManifestStatus } from "@/features/projects/api/projects";
import { readManifest } from "@/features/projects/api/projects";
import { useProjects, useRuntime } from "@/store";

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
  const runtime = useRuntime();
  const projects = useProjects();

  const manifestsQuery = useQuery({
    queryKey: projectKeys.catalog(),
    queryFn: async () => {
      const manifestEntries = await Promise.all(
        projects.map(
          async (project) => [project.id, await readManifest(runtime, project.path)] as const,
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
  const runtime = useRuntime();
  const enabled = projectId !== null;
  const projects = useProjects();

  return useQuery({
    queryKey: projectId
      ? projectKeys.manifest(projectId)
      : ["project-manifest", "disabled"],
    queryFn: async () => {
      const project = projects.find((item) => item.id === projectId);
      if (!project) {
        return null;
      }
      return readManifest(runtime, project.path);
    },
    enabled,
  });
}
