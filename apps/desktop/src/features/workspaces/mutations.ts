import {
  getManifestFingerprint,
  type WorkspaceCheckoutType,
  type WorkspaceHost,
  type WorkspaceRecord,
} from "@lifecycle/contracts";
import { selectProjectById } from "@lifecycle/store";
import { useCallback } from "react";
import { useWorkspaceHostClientRegistry } from "@lifecycle/workspace/client/react";
import { computeWorkspaceCreatePolicy } from "@lifecycle/workspace/policy";
import { getCurrentBranch } from "@/features/projects/api/current-branch";
import { readManifest } from "@/features/projects/api/projects";
import { useStoreContext } from "@/store/provider";

export interface CreateWorkspaceForProjectInput {
  checkoutType: WorkspaceCheckoutType;
  host: WorkspaceHost;
  projectId: string;
  workspaceName?: string;
}

export function useWorkspaceMutations() {
  const { collections, driver } = useStoreContext();
  const workspaceHostClientRegistry = useWorkspaceHostClientRegistry();

  const createWorkspaceForProject = useCallback(
    async (input: CreateWorkspaceForProjectInput): Promise<string> => {
      const project = await selectProjectById(driver, input.projectId);
      if (!project) {
        throw new Error(`Project "${input.projectId}" was not found.`);
      }

      const manifestStatus = await readManifest(project.path);
      const manifestJson =
        manifestStatus.state === "valid" ? JSON.stringify(manifestStatus.result.config) : undefined;
      const manifestFingerprint =
        manifestStatus.state === "valid"
          ? getManifestFingerprint(manifestStatus.result.config)
          : null;
      const currentBranch = await getCurrentBranch(project.path);
      const policy = computeWorkspaceCreatePolicy({
        host: input.host,
        checkoutType: input.checkoutType,
        projectId: project.id,
        projectPath: project.path,
        workspaceName: input.workspaceName,
        baseRef: currentBranch,
        currentBranch,
        manifestJson,
        manifestFingerprint,
      });

      const now = new Date().toISOString();
      const transaction = collections.workspaces.insert(
        {
          id: policy.workspaceId,
          project_id: policy.projectId,
          name: policy.name,
          checkout_type: policy.checkoutType,
          source_ref: policy.sourceRef,
          git_sha: null,
          worktree_path: null,
          host: policy.host,
          manifest_fingerprint: policy.manifestFingerprint ?? null,
          created_at: now,
          updated_at: now,
          last_active_at: now,
          prepared_at: null,
          status: "provisioning",
          failure_reason: null,
          failed_at: null,
        },
        {
          metadata: {
            nameOrigin: policy.nameOrigin,
            sourceRefOrigin: policy.sourceRefOrigin,
          },
        },
      );
      await transaction.isPersisted.promise;
      return policy.workspaceId;
    },
    [collections.workspaces, driver],
  );

  const inspectArchive = useCallback(
    async (workspace: WorkspaceRecord) => {
      const workspaceHostClient = workspaceHostClientRegistry.resolve(workspace.host);
      return workspaceHostClient.inspectArchive(workspace);
    },
    [workspaceHostClientRegistry],
  );

  const archiveWorkspace = useCallback(
    async (workspace: WorkspaceRecord): Promise<void> => {
      const workspaceHostClient = workspaceHostClientRegistry.resolve(workspace.host);
      await workspaceHostClient.archiveWorkspace(workspace);
      await Promise.all([
        collections.workspaces.utils.refresh(),
        collections.services.utils.refresh(),
      ]);
    },
    [collections.services, collections.workspaces, workspaceHostClientRegistry],
  );

  const renameWorkspaceRecord = useCallback(
    async (workspace: WorkspaceRecord, name: string): Promise<WorkspaceRecord> => {
      const workspaceHostClient = workspaceHostClientRegistry.resolve(workspace.host);
      const updatedWorkspace = await workspaceHostClient.renameWorkspace(workspace, name);
      const transaction = collections.workspaces.update(updatedWorkspace.id, (draft) => {
        Object.assign(draft, updatedWorkspace);
      });
      await transaction.isPersisted.promise;
      return updatedWorkspace;
    },
    [collections.workspaces, workspaceHostClientRegistry],
  );

  return {
    archiveWorkspace,
    createWorkspaceForProject,
    inspectArchive,
    renameWorkspace: renameWorkspaceRecord,
  };
}
