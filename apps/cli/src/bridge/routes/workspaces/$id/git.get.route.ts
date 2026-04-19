import { createRoute } from "routedjs";
import { z } from "zod";

import { readWorkspaceGitSnapshot } from "../../../domains/workspace/git";

const GitFileChangeKindSchema = z
  .enum([
    "modified",
    "added",
    "deleted",
    "renamed",
    "copied",
    "unmerged",
    "untracked",
    "ignored",
    "type_changed",
  ])
  .meta({ id: "BridgeGitFileChangeKind" });

const GitFileStatsSchema = z
  .object({
    insertions: z.number().int().nullable(),
    deletions: z.number().int().nullable(),
  })
  .meta({ id: "BridgeGitFileStats" });

const GitFileStatusSchema = z
  .object({
    path: z.string(),
    originalPath: z.string().nullable().optional(),
    indexStatus: GitFileChangeKindSchema.nullable(),
    worktreeStatus: GitFileChangeKindSchema.nullable(),
    staged: z.boolean(),
    unstaged: z.boolean(),
    stats: GitFileStatsSchema,
  })
  .meta({ id: "BridgeGitFileStatus" });

const GitStatusResultSchema = z
  .object({
    branch: z.string().nullable(),
    headSha: z.string().nullable(),
    upstream: z.string().nullable(),
    ahead: z.number().int(),
    behind: z.number().int(),
    files: z.array(GitFileStatusSchema),
  })
  .meta({ id: "BridgeGitStatusResult" });

const GitLogEntrySchema = z
  .object({
    sha: z.string(),
    shortSha: z.string(),
    message: z.string(),
    author: z.string(),
    email: z.string(),
    timestamp: z.string(),
  })
  .meta({ id: "BridgeGitLogEntry" });

const GitPullRequestSupportSchema = z
  .object({
    available: z.boolean(),
    provider: z.enum(["github"]).nullable(),
    reason: z
      .enum([
        "mode_not_supported",
        "provider_unavailable",
        "authentication_required",
        "repository_unavailable",
        "unsupported_remote",
      ])
      .nullable(),
    message: z.string().nullable(),
  })
  .meta({ id: "BridgeGitPullRequestSupport" });

const GitPullRequestCheckSummarySchema = z
  .object({
    name: z.string(),
    status: z.enum(["pending", "success", "failed", "neutral"]),
    workflowName: z.string().nullable(),
    detailsUrl: z.string().nullable(),
  })
  .meta({ id: "BridgeGitPullRequestCheckSummary" });

const GitPullRequestSummarySchema = z
  .object({
    number: z.number().int(),
    title: z.string(),
    url: z.string(),
    state: z.enum(["open", "closed", "merged"]),
    isDraft: z.boolean(),
    author: z.string(),
    headRefName: z.string(),
    baseRefName: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    mergeable: z.enum(["mergeable", "conflicting", "unknown"]),
    mergeStateStatus: z.string().nullable(),
    reviewDecision: z.enum(["approved", "changes_requested", "review_required"]).nullable(),
    checks: z.array(GitPullRequestCheckSummarySchema).nullable(),
  })
  .meta({ id: "BridgeGitPullRequestSummary" });

const GitPullRequestListResultSchema = z
  .object({
    support: GitPullRequestSupportSchema,
    pullRequests: z.array(GitPullRequestSummarySchema),
  })
  .meta({ id: "BridgeGitPullRequestListResult" });

const GitBranchPullRequestResultSchema = z
  .object({
    support: GitPullRequestSupportSchema,
    branch: z.string().nullable(),
    upstream: z.string().nullable(),
    hasPullRequestChanges: z.boolean().nullable(),
    suggestedBaseRef: z.string().nullable(),
    pullRequest: GitPullRequestSummarySchema.nullable(),
  })
  .meta({ id: "BridgeGitBranchPullRequestResult" });

const BridgeWorkspaceGitResponseSchema = z
  .object({
    status: GitStatusResultSchema,
    commits: z.array(GitLogEntrySchema),
    currentBranch: GitBranchPullRequestResultSchema,
    pullRequests: GitPullRequestListResultSchema,
  })
  .meta({ id: "BridgeWorkspaceGitResponse" });

export default createRoute({
  schemas: {
    params: z.object({
      id: z.string().min(1),
    }),
    responses: {
      200: BridgeWorkspaceGitResponseSchema,
    },
  },
  handler: async ({ params, ctx }) => {
    const db = ctx.get("db");
    const workspaceRegistry = ctx.get("workspaceRegistry");

    return readWorkspaceGitSnapshot(db, workspaceRegistry, params.id);
  },
});
