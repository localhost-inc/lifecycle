import type { RepositoryRecord } from "@lifecycle/contracts";
import { selectWorkspacesByRepository } from "@lifecycle/store";
import { useCallback } from "react";
import { chooseRepositoryDirectory, cleanupRepository } from "@/lib/repositories";
import { waitForDbReady } from "@/lib/db";
import { useStoreContext } from "@/store/provider";

function nameFromPath(projectPath: string): string {
  const segments = projectPath.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] ?? "unknown";
}

export function useRepositoryMutations() {
  const { collections, driver } = useStoreContext();

  const createRepositoryFromDirectory = useCallback(async (): Promise<RepositoryRecord | null> => {
    const repositoryPath = await chooseRepositoryDirectory();
    if (!repositoryPath) {
      return null;
    }

    await waitForDbReady();

    const now = new Date().toISOString();
    const repository: RepositoryRecord = {
      id: crypto.randomUUID(),
      path: repositoryPath,
      name: nameFromPath(repositoryPath),
      manifestPath: "lifecycle.json",
      manifestValid: false,
      createdAt: now,
      updatedAt: now,
    };

    const transaction = collections.repositories.insert(repository);
    await transaction.isPersisted.promise;
    return repository;
  }, [collections.repositories]);

  const removeRepository = useCallback(
    async (repositoryId: string): Promise<void> => {
      const rootWorkspaceIds = (await selectWorkspacesByRepository(driver, repositoryId))
        .filter((workspace) => workspace.checkout_type === "root")
        .map((workspace) => workspace.id);
      await cleanupRepository(rootWorkspaceIds);
      const transaction = collections.repositories.delete(repositoryId);
      await transaction.isPersisted.promise;
    },
    [collections.repositories, driver],
  );

  const updateRepositoryManifestValid = useCallback(
    async (repositoryId: string, valid: boolean): Promise<void> => {
      const transaction = collections.repositories.update(repositoryId, (draft) => {
        draft.manifestValid = valid;
        draft.updatedAt = new Date().toISOString();
      });
      await transaction.isPersisted.promise;
    },
    [collections.repositories],
  );

  return {
    createRepositoryFromDirectory,
    removeRepository,
    updateRepositoryManifestValid,
  };
}
