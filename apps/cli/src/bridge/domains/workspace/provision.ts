import { homedir } from "node:os";
import { join } from "node:path";
import type { WorkspaceHost, WorkspaceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { slugifyName } from "@lifecycle/contracts";
import {
  archiveWorkspace as markWorkspaceArchived,
  getRepositoryById,
  getRepositoryByPath,
  getWorkspaceRecordById,
  insertRepository,
  insertWorkspaceStatement,
  listWorkspacesByRepository,
  resolveUniqueWorkspaceSlug,
} from "@lifecycle/db/queries";
import { readCredentials } from "../auth/credentials";
import { BridgeError } from "../../lib/errors";
import type { WorkspaceHostRegistry } from "./registry";

export interface CreateWorkspaceInput {
  host?: WorkspaceHost;
  name: string;
  repoPath: string;
  sourceRef?: string | null;
  organizationSlug?: string | null;
}

export interface ArchiveWorkspaceRequest {
  force?: boolean;
  repoPath?: string;
  workspaceId: string;
}

export function resolveLocalWorktreeRoot(input: {
  organizationSlug?: string | null;
  repositoryName: string;
  repositorySlug?: string | null;
  homePath?: string;
}): string {
  const organizationSlug = slugifyName(input.organizationSlug?.trim() || "local", "local");
  const repositorySlug = slugifyName(
    input.repositorySlug?.trim() || input.repositoryName.trim(),
    "repository",
  );

  return join(
    input.homePath ?? homedir(),
    ".lifecycle",
    "worktrees",
    organizationSlug,
    repositorySlug,
  );
}

export async function createWorkspace(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  input: CreateWorkspaceInput,
) {
  const host = input.host ?? "local";
  if (host !== "local") {
    throw new BridgeError({
      code: "workspace_host_unsupported",
      message: `Workspace creation for host "${host}" is not supported yet.`,
      status: 422,
    });
  }

  const repoPath = input.repoPath.trim();
  if (!repoPath) {
    throw new BridgeError({
      code: "workspace_repo_path_required",
      message: "Workspace creation requires a repository path.",
      status: 400,
    });
  }

  const name = input.name.trim();
  if (!name) {
    throw new BridgeError({
      code: "workspace_name_required",
      message: "Workspace creation requires a workspace name.",
      status: 400,
    });
  }

  const sourceRef = input.sourceRef?.trim() || name;
  let repository = await getRepositoryByPath(db, repoPath);
  if (!repository) {
    const repoName = repoPath.split("/").pop() ?? repoPath;
    const repositoryId = await insertRepository(db, { path: repoPath, name: repoName });
    repository = {
      id: repositoryId,
      path: repoPath,
      name: repoName,
      slug: "",
      manifest_path: "lifecycle.json",
      manifest_valid: 0,
      created_at: "",
      updated_at: "",
    };
  }

  const now = new Date().toISOString();
  const slug = await resolveUniqueWorkspaceSlug(db, repository.id, name);
  const draftWorkspace: WorkspaceRecord = {
    id: crypto.randomUUID(),
    repository_id: repository.id,
    name,
    slug,
    checkout_type: "worktree",
    source_ref: sourceRef,
    git_sha: null,
    workspace_root: null,
    host,
    manifest_fingerprint: null,
    prepared_at: null,
    status: "provisioning",
    failure_reason: null,
    failed_at: null,
    created_at: now,
    updated_at: now,
    last_active_at: now,
  };

  const worktreeRoot =
    host === "local"
      ? resolveLocalWorktreeRoot({
          organizationSlug: input.organizationSlug ?? readCredentials()?.activeOrgSlug ?? null,
          repositoryName: repository.name,
          repositorySlug: repository.slug,
        })
      : null;

  const ensuredWorkspace = await workspaceHosts.resolve(host).ensureWorkspace({
    workspace: draftWorkspace,
    repositoryPath: repoPath,
    worktreeRoot,
  });

  const insert = insertWorkspaceStatement(ensuredWorkspace);
  await db.execute(insert.sql, insert.params);

  return {
    id: ensuredWorkspace.id,
    repositoryId: repository.id,
    host: ensuredWorkspace.host,
    name: ensuredWorkspace.name,
    sourceRef: ensuredWorkspace.source_ref,
    workspaceRoot: ensuredWorkspace.workspace_root,
  };
}

export async function archiveWorkspace(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  input: ArchiveWorkspaceRequest,
) {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) {
    throw new BridgeError({
      code: "workspace_id_required",
      message: "Workspace archive requires a workspace id.",
      status: 400,
    });
  }

  let workspace = await getWorkspaceRecordById(db, workspaceId);
  if (workspace?.status === "archived") {
    workspace = undefined;
  }

  const repoPath = input.repoPath?.trim();
  let repository =
    workspace && !repoPath
      ? await getRepositoryById(db, workspace.repository_id)
      : repoPath
        ? await getRepositoryByPath(db, repoPath)
        : null;

  if (repoPath && !repository) {
    throw new BridgeError({
      code: "repository_not_found",
      message: `Could not resolve repository for path "${repoPath}".`,
      status: 404,
    });
  }

  if (
    workspace &&
    repository &&
    (workspace.repository_id !== repository.id || workspace.status === "archived")
  ) {
    workspace = undefined;
  }

  if (!workspace && repository) {
    workspace = (await listWorkspacesByRepository(db, repository.id)).find(
      (candidate) => candidate.name === workspaceId,
    );
  }

  if (!workspace) {
    throw new BridgeError({
      code: "workspace_not_found",
      message: `Could not resolve workspace "${workspaceId}".`,
      status: 404,
    });
  }

  if (!repository) {
    repository = await getRepositoryById(db, workspace.repository_id);
  }
  if (!repository) {
    throw new BridgeError({
      code: "repository_not_found",
      message: `Could not resolve repository "${workspace.repository_id}" for workspace "${workspace.id}".`,
      status: 404,
    });
  }

  const archiveDisposition = await workspaceHosts.resolve(workspace.host).inspectArchive(workspace);
  if (!input.force && archiveDisposition.hasUncommittedChanges) {
    throw new BridgeError({
      code: "workspace_has_uncommitted_changes",
      message: `Workspace "${workspace.name}" has uncommitted changes. Retry with force to archive anyway.`,
      status: 409,
    });
  }

  await workspaceHosts.resolve(workspace.host).archiveWorkspace({
    workspace,
    repositoryPath: repository.path,
  });
  await markWorkspaceArchived(db, repository.id, workspace.name);

  return {
    archived: true,
    name: workspace.name,
  };
}
