import { useMemo } from "react";
import type { ProjectRecord } from "@lifecycle/contracts";
import type { ManifestStatus } from "./api/projects";
import { useQuery, type QueryDescriptor, type QueryResult } from "../../query";

export interface ProjectCatalog {
  manifestsByProjectId: Record<string, ManifestStatus>;
  projects: ProjectRecord[];
}

export const projectKeys = {
  catalog: () => ["project-catalog"] as const,
  manifest: (projectId: string) => ["project-manifest", projectId] as const,
};

export const projectCatalogQuery: QueryDescriptor<ProjectCatalog> = {
  key: projectKeys.catalog(),
  async fetch(source) {
    const projects = await source.listProjects();
    const manifestEntries = await Promise.all(
      projects.map(
        async (project) => [project.id, await source.readManifest(project.path)] as const,
      ),
    );

    return {
      manifestsByProjectId: Object.fromEntries(manifestEntries),
      projects,
    };
  },
};

function createProjectManifestQuery(projectId: string): QueryDescriptor<ManifestStatus | null> {
  return {
    key: projectKeys.manifest(projectId),
    async fetch(source) {
      const projects = await source.listProjects();
      const project = projects.find((item) => item.id === projectId);
      if (!project) {
        return null;
      }
      return source.readManifest(project.path);
    },
  };
}

export function useProjectCatalog() {
  return useQuery(projectCatalogQuery, {
    disabledData: undefined,
  });
}

export function useProjects(): QueryResult<ProjectRecord[] | undefined> {
  const query = useProjectCatalog();

  return useMemo(
    () => ({
      ...query,
      data: query.data?.projects,
    }),
    [query],
  );
}

export function useProjectManifestStates(): QueryResult<
  Record<string, ManifestStatus["state"]> | undefined
> {
  const query = useProjectCatalog();

  return useMemo(
    () => ({
      ...query,
      data: query.data
        ? Object.fromEntries(
            Object.entries(query.data.manifestsByProjectId).map(([projectId, manifest]) => [
              projectId,
              manifest.state,
            ]),
          )
        : undefined,
    }),
    [query],
  );
}

export function useProjectManifest(projectId: string | null): QueryResult<ManifestStatus | null> {
  const descriptor = useMemo(
    () => (projectId ? createProjectManifestQuery(projectId) : null),
    [projectId],
  );

  return useQuery(descriptor, {
    disabledData: null,
  });
}
