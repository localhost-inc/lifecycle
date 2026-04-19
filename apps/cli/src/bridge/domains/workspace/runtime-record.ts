import { existsSync } from "node:fs";
import { dirname } from "node:path";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { getRepositoryById, updateWorkspaceStatement } from "@lifecycle/db/queries";
import { resolveLocalWorktreeRoot } from "./provision";
import { normalizeWorkspaceHost } from "./resolve";
import type { WorkspaceHostRegistry } from "./registry";

export async function ensureRuntimeWorkspaceRecord(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  record: WorkspaceRecord,
): Promise<WorkspaceRecord> {
  if (!shouldRepairRuntimeWorkspace(record)) {
    return record;
  }

  const repository = await getRepositoryById(db, record.repository_id);
  if (!repository) {
    throw new Error(
      `Could not resolve repository "${record.repository_id}" for workspace "${record.id}".`,
    );
  }

  const ensuredWorkspace = await workspaceHosts
    .resolve(normalizeWorkspaceHost(record.host))
    .ensureWorkspace({
      workspace: record,
      repositoryPath: repository.path,
      worktreeRoot: resolveWorkspaceRepairRoot(record, repository),
    });

  const update = updateWorkspaceStatement({
    ...ensuredWorkspace,
    manifest_fingerprint: ensuredWorkspace.manifest_fingerprint ?? null,
    prepared_at: ensuredWorkspace.prepared_at ?? null,
  });
  await db.execute(update.sql, update.params);
  return ensuredWorkspace;
}

function shouldRepairRuntimeWorkspace(record: WorkspaceRecord): boolean {
  if (record.host !== "local") {
    return false;
  }

  return !record.workspace_root || !existsSync(record.workspace_root);
}

function resolveWorkspaceRepairRoot(
  record: WorkspaceRecord,
  repository: {
    name: string;
    path: string;
    slug: string;
  },
): string | null {
  if (record.checkout_type === "root") {
    return null;
  }

  if (record.workspace_root) {
    return dirname(record.workspace_root);
  }

  return resolveLocalWorktreeRoot({
    repositoryName: repository.name,
    repositorySlug: repository.slug,
  });
}
