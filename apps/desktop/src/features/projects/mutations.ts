import type { ProjectRecord } from "@lifecycle/contracts";
import { useCallback } from "react";
import { chooseProjectDirectory, cleanupProject } from "@/features/projects/api/projects";
import { useStoreContext } from "@/store/provider";

function nameFromPath(projectPath: string): string {
  const segments = projectPath.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] ?? "unknown";
}

export function useProjectMutations() {
  const { collections } = useStoreContext();

  const createProjectFromDirectory = useCallback(async (): Promise<ProjectRecord | null> => {
    const projectPath = await chooseProjectDirectory();
    if (!projectPath) {
      return null;
    }

    const now = new Date().toISOString();
    const project: ProjectRecord = {
      id: crypto.randomUUID(),
      path: projectPath,
      name: nameFromPath(projectPath),
      manifestPath: "lifecycle.json",
      manifestValid: false,
      createdAt: now,
      updatedAt: now,
    };

    const transaction = collections.projects.insert(project);
    await transaction.isPersisted.promise;
    return project;
  }, [collections.projects]);

  const removeProject = useCallback(
    async (projectId: string): Promise<void> => {
      await cleanupProject(projectId);
      const transaction = collections.projects.delete(projectId);
      await transaction.isPersisted.promise;
    },
    [collections.projects],
  );

  const updateProjectManifestValid = useCallback(
    async (projectId: string, valid: boolean): Promise<void> => {
      const transaction = collections.projects.update(projectId, (draft) => {
        draft.manifestValid = valid;
        draft.updatedAt = new Date().toISOString();
      });
      await transaction.isPersisted.promise;
    },
    [collections.projects],
  );

  return {
    createProjectFromDirectory,
    removeProject,
    updateProjectManifestValid,
  };
}
