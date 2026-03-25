import type { AgentSessionProviderId, GitPullRequestCheckSummary } from "@lifecycle/contracts";
import type { PullRequestTab } from "@/features/workspaces/surfaces/workspace-surface-tab-records";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getOptionalString(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" ? field : undefined;
}

export function isValidAgentSessionProvider(value: unknown): value is AgentSessionProviderId {
  return value === "claude" || value === "codex";
}

export function isValidPullRequestState(value: unknown): value is PullRequestTab["state"] {
  return value === "open" || value === "closed" || value === "merged";
}

export function isValidPullRequestMergeable(value: unknown): value is PullRequestTab["mergeable"] {
  return value === "mergeable" || value === "conflicting" || value === "unknown";
}

export function isValidPullRequestReviewDecision(
  value: unknown,
): value is Exclude<PullRequestTab["reviewDecision"], null> {
  return value === "approved" || value === "changes_requested" || value === "review_required";
}

function isValidPullRequestCheckStatus(
  value: unknown,
): value is GitPullRequestCheckSummary["status"] {
  return value === "pending" || value === "success" || value === "failed" || value === "neutral";
}

export function parsePullRequestChecks(
  value: unknown,
): GitPullRequestCheckSummary[] | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const checks: GitPullRequestCheckSummary[] = [];

  for (const item of value) {
    if (!isRecord(item)) {
      return undefined;
    }

    const name = getOptionalString(item, "name");
    const status = item.status;
    if (!name || !isValidPullRequestCheckStatus(status)) {
      return undefined;
    }

    const workflowName =
      item.workflowName === null ? null : (getOptionalString(item, "workflowName") ?? undefined);
    const detailsUrl =
      item.detailsUrl === null ? null : (getOptionalString(item, "detailsUrl") ?? undefined);
    if (workflowName === undefined || detailsUrl === undefined) {
      return undefined;
    }

    checks.push({
      detailsUrl,
      name,
      status,
      workflowName,
    });
  }

  return checks;
}
