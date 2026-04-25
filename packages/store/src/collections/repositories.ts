import { createBridgeCollection, type BridgeCollection, type BridgeTransport } from "../collection";

export interface BridgeRepositoryWorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  host: "local" | "docker" | "remote" | "cloud";
  status: string;
  ref?: string;
  path?: string;
}

export interface BridgeRepositorySummary {
  id: string;
  name: string;
  slug: string;
  path: string;
  source: "local";
  workspaces: BridgeRepositoryWorkspaceSummary[];
}

interface BridgeRepositoriesResponse {
  repositories: BridgeRepositorySummary[];
}

export async function fetchRepositories(
  bridge: BridgeTransport,
): Promise<BridgeRepositorySummary[]> {
  const response = await bridge.request<BridgeRepositoriesResponse>({ path: "/repos" });
  return response.repositories;
}

export function createRepositoryCollection(
  bridge: BridgeTransport,
): BridgeCollection<BridgeRepositorySummary> {
  return createBridgeCollection<BridgeRepositorySummary>({
    id: "repositories",
    load: () => fetchRepositories(bridge),
    getKey: (repository) => repository.id,
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map((mutation) =>
          bridge.request<void>({ method: "DELETE", path: `/repos/${String(mutation.key)}` }),
        ),
      );
    },
  });
}
