import type { ProjectRecord } from "@lifecycle/contracts";
import { selectWorkspacesByProject } from "@lifecycle/store";
import { useCallback } from "react";
import { chooseProjectDirectory, cleanupProject } from "@/lib/projects";
import { waitForDbReady } from "@/lib/db";
import { useStoreContext } from "@/store/provider";

function nameFromPath(projectPath: string): string {
  const segments = projectPath.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] ?? "unknown";
}

export function useProjectMutations() {
  const { collections, driver } = useStoreContext();

  const createProjectFromDirectory = useCallback(async (): Promise<ProjectRecord | null> => {
    const projectPath = await chooseProjectDirectory();
    if (!projectPath) {
      return null;
    }

    await waitForDbReady();

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
      const rootWorkspaceIds = (await selectWorkspacesByProject(driver, projectId))
        .filter((workspace) => workspace.checkout_type === "root")
        .map((workspace) => workspace.id);
      await cleanupProject(rootWorkspaceIds);
      const transaction = collections.projects.delete(projectId);
      await transaction.isPersisted.promise;
    },
    [collections.projects, driver],
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
