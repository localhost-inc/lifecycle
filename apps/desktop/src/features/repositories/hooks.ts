import { useMemo } from "react";
import type { RepositoryRecord } from "@lifecycle/contracts";
import type { ManifestStatus } from "@lifecycle/workspace";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useWorkspaceClientRegistry } from "@lifecycle/workspace/react";
import { useRepositories } from "@/store";

export interface RepositoryCatalog {
  manifestsByRepositoryId: Record<string, ManifestStatus>;
  repositories: RepositoryRecord[];
}

export const repositoryKeys = {
  catalog: () => ["repository-catalog"] as const,
  manifest: (repositoryId: string) => ["repository-manifest", repositoryId] as const,
};

/**
 * Returns the repository catalog: repositories from TanStack DB plus manifests from React Query.
 */
export function useRepositoryCatalog(): {
  data: RepositoryCatalog | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const repositories = useRepositories();
  const localWorkspaceClient = useWorkspaceClientRegistry().resolve("local");

  const manifestsQuery = useQuery({
    queryKey: repositoryKeys.catalog(),
    queryFn: async () => {
      const manifestEntries = await Promise.all(
        repositories.map(
          async (repository) =>
            [repository.id, await localWorkspaceClient.readManifest(repository.path)] as const,
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
      manifestsByRepositoryId: manifestsQuery.data,
      repositories,
    };
  }, [manifestsQuery.data, repositories]);

  return {
    data,
    isLoading: manifestsQuery.isLoading,
    error: manifestsQuery.error,
  };
}

export function useRepositoryManifest(
  repositoryId: string | null,
): UseQueryResult<ManifestStatus | null> {
  const enabled = repositoryId !== null;
  const repositories = useRepositories();
  const localWorkspaceClient = useWorkspaceClientRegistry().resolve("local");

  return useQuery({
    queryKey:
      repositoryId ? repositoryKeys.manifest(repositoryId) : ["repository-manifest", "disabled"],
    queryFn: async () => {
      const repository = repositories.find((item) => item.id === repositoryId);
      if (!repository) {
        return null;
      }
      return localWorkspaceClient.readManifest(repository.path);
    },
    enabled,
  });
}
