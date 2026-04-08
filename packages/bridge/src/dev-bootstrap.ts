import type { SqlDriver } from "@lifecycle/db";
import {
  getRepositoryByPath,
  insertRepository,
  insertWorkspace,
  listWorkspacesByRepository,
} from "@lifecycle/db/queries";
import type { WorkspaceClientRegistry } from "@lifecycle/workspace";

function isDevRepositoryBootstrapEnabled(environment: NodeJS.ProcessEnv): boolean {
  return environment.LIFECYCLE_DEV === "1" && typeof environment.LIFECYCLE_REPO_ROOT === "string";
}

export async function ensureDevRepositorySeeded(
  db: SqlDriver,
  workspaceRegistry: WorkspaceClientRegistry,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!isDevRepositoryBootstrapEnabled(environment)) {
    return;
  }

  const repoPath = environment.LIFECYCLE_REPO_ROOT?.trim();
  if (!repoPath) {
    return;
  }

  const repoName = repoPath.split("/").filter(Boolean).pop() ?? repoPath;
  const localClient = workspaceRegistry.resolve("local");
  const currentBranch = (await localClient.getGitCurrentBranch(repoPath)).trim();
  if (!currentBranch) {
    throw new Error(`Could not resolve the current branch for dev repository "${repoPath}".`);
  }

  const existingRepository = await getRepositoryByPath(db, repoPath);
  const repositoryId =
    existingRepository?.id ?? (await insertRepository(db, { path: repoPath, name: repoName }));

  const workspaces = await listWorkspacesByRepository(db, repositoryId);
  const hasRootWorkspace = workspaces.some((workspace) => workspace.checkout_type === "root");
  if (hasRootWorkspace) {
    return;
  }

  await insertWorkspace(db, {
    repositoryId,
    name: currentBranch,
    sourceRef: currentBranch,
    workspaceRoot: repoPath,
    host: "local",
    checkoutType: "root",
  });
}
