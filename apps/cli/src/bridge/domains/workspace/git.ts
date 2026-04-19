import type {
  GitBranchPullRequestResult,
  GitPullRequestListResult,
  GitPullRequestSupportReason,
} from "@lifecycle/contracts";
import type { SqlDriver } from "@lifecycle/db";
import { getWorkspaceRecordById } from "@lifecycle/db/queries";
import type { WorkspaceHostAdapter } from "./host";
import { ensureRuntimeWorkspaceRecord } from "./runtime-record";
import { resolveWorkspaceRecord } from "./resolve";
import type { WorkspaceHostRegistry } from "./registry";

export async function readWorkspaceGitSnapshot(
  db: SqlDriver,
  workspaceHosts: WorkspaceHostRegistry,
  workspaceId: string,
) {
  const initialRecord = await getWorkspaceRecordById(db, workspaceId);
  if (!initialRecord) {
    throw new Error(`Could not resolve workspace "${workspaceId}".`);
  }

  const record = await ensureRuntimeWorkspaceRecord(db, workspaceHosts, initialRecord);
  const client = workspaceHosts.resolve(record.host);
  const workspace = await resolveWorkspaceRecord(db, workspaceId);
  const [status, commits] = await Promise.all([
    client.getGitStatus(workspace),
    client.listGitLog(workspace, 10),
  ]);
  const [currentBranch, pullRequests] = await Promise.all([
    readCurrentBranchPullRequest(client, workspace, status.branch, status.upstream),
    readPullRequests(client, workspace),
  ]);

  return { status, commits, currentBranch, pullRequests };
}

async function readCurrentBranchPullRequest(
  client: WorkspaceHostAdapter,
  workspace: Awaited<ReturnType<typeof resolveWorkspaceRecord>>,
  branch: string | null,
  upstream: string | null,
): Promise<GitBranchPullRequestResult> {
  try {
    return await client.getCurrentGitPullRequest(workspace);
  } catch (error) {
    return {
      support: unsupportedPullRequestSupport(error),
      branch,
      upstream,
      hasPullRequestChanges: null,
      suggestedBaseRef: null,
      pullRequest: null,
    };
  }
}

async function readPullRequests(
  client: WorkspaceHostAdapter,
  workspace: Awaited<ReturnType<typeof resolveWorkspaceRecord>>,
): Promise<GitPullRequestListResult> {
  try {
    return await client.listGitPullRequests(workspace);
  } catch (error) {
    return {
      support: unsupportedPullRequestSupport(error),
      pullRequests: [],
    };
  }
}

function unsupportedPullRequestSupport(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    available: false,
    provider: null,
    reason: inferPullRequestSupportReason(message),
    message,
  };
}

function inferPullRequestSupportReason(message: string): GitPullRequestSupportReason {
  const lower = message.toLowerCase();

  if (lower.includes("not implemented")) {
    return "mode_not_supported";
  }
  if (lower.includes("auth")) {
    return "authentication_required";
  }
  if (lower.includes("remote")) {
    return "unsupported_remote";
  }
  if (lower.includes("repo")) {
    return "repository_unavailable";
  }
  return "provider_unavailable";
}
