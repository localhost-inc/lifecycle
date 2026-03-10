import type {
  GitPullRequestCheckStatus,
  GitPullRequestSummary,
  GitPullRequestMergeable,
  GitPullRequestState,
} from "@lifecycle/contracts";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  EmptyState,
  StatusDot,
  type StatusDotTone,
} from "@lifecycle/ui";
import { useMemo } from "react";
import { formatRelativeTime } from "../../../lib/format";
import { useCurrentGitPullRequest, useGitPullRequests } from "../hooks";

interface PullRequestSurfaceProps {
  pullRequest: GitPullRequestSummary;
  workspaceId: string;
}

function checkTone(status: GitPullRequestCheckStatus): StatusDotTone {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "danger";
    case "pending":
      return "warning";
    default:
      return "neutral";
  }
}

function checkLabel(status: GitPullRequestCheckStatus): string {
  switch (status) {
    case "success":
      return "Passing";
    case "failed":
      return "Failing";
    case "pending":
      return "Running";
    default:
      return "Neutral";
  }
}

function mergeableBadgeVariant(mergeable: GitPullRequestMergeable): "info" | "muted" | "success" {
  if (mergeable === "mergeable") {
    return "success";
  }

  if (mergeable === "conflicting") {
    return "info";
  }

  return "muted";
}

function stateBadgeVariant(state: GitPullRequestState): "info" | "muted" | "success" {
  if (state === "merged") {
    return "success";
  }

  if (state === "closed") {
    return "muted";
  }

  return "info";
}

function stateLabel(state: GitPullRequestState): string {
  switch (state) {
    case "merged":
      return "Merged";
    case "closed":
      return "Closed";
    default:
      return "Open";
  }
}

function reviewDecisionLabel(reviewDecision: GitPullRequestSummary["reviewDecision"]): string {
  return reviewDecision ? reviewDecision.replaceAll("_", " ") : "";
}

function liveSnapshotMessage(
  loading: boolean,
  snapshot: GitPullRequestSummary,
  livePullRequest: GitPullRequestSummary | null,
  supportMessage: string | null,
): string | null {
  if (livePullRequest) {
    return null;
  }

  if (loading) {
    return "Loading the latest pull request state.";
  }

  if (supportMessage) {
    return `Showing the last known snapshot for PR #${snapshot.number}. ${supportMessage}`;
  }

  return `Showing the last known snapshot for PR #${snapshot.number}. It may no longer be in the open repository list.`;
}

export function PullRequestSurface({
  pullRequest: snapshot,
  workspaceId,
}: PullRequestSurfaceProps) {
  const pullRequestsQuery = useGitPullRequests(workspaceId);
  const currentPullRequestQuery = useCurrentGitPullRequest(workspaceId);
  const livePullRequest = useMemo(() => {
    const currentPullRequest = currentPullRequestQuery.data?.pullRequest;
    if (currentPullRequest?.number === snapshot.number) {
      return currentPullRequest;
    }

    return (
      pullRequestsQuery.data?.pullRequests.find(
        (pullRequest) => pullRequest.number === snapshot.number,
      ) ?? null
    );
  }, [
    currentPullRequestQuery.data?.pullRequest,
    pullRequestsQuery.data?.pullRequests,
    snapshot.number,
  ]);
  const pullRequest = livePullRequest ?? snapshot;
  const currentBranchPullRequestNumber = currentPullRequestQuery.data?.pullRequest?.number ?? null;
  const supportMessage =
    currentPullRequestQuery.data?.support.message ??
    pullRequestsQuery.data?.support.message ??
    null;
  const snapshotMessage = liveSnapshotMessage(
    pullRequestsQuery.isLoading || currentPullRequestQuery.isLoading,
    snapshot,
    livePullRequest,
    supportMessage,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
      <div className="border-b border-[var(--border)] px-5 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Pull Request
            </p>
            <h2 className="mt-2 text-lg font-semibold leading-snug text-[var(--foreground)]">
              {pullRequest.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              #{pullRequest.number} opened by {pullRequest.author} · updated{" "}
              {formatRelativeTime(pullRequest.updatedAt)}
            </p>
          </div>
          <Button
            onClick={() => window.open(pullRequest.url, "_blank", "noopener,noreferrer")}
            size="sm"
            variant="outline"
          >
            Open on GitHub
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant={stateBadgeVariant(pullRequest.state)}>
            {stateLabel(pullRequest.state)}
          </Badge>
          {pullRequest.isDraft ? <Badge variant="muted">Draft</Badge> : null}
          {currentBranchPullRequestNumber === pullRequest.number ? (
            <Badge variant="info">Current Branch</Badge>
          ) : null}
          <Badge variant={mergeableBadgeVariant(pullRequest.mergeable)}>
            {pullRequest.mergeable === "mergeable"
              ? "Mergeable"
              : pullRequest.mergeable === "conflicting"
                ? "Conflicting"
                : "Mergeability unknown"}
          </Badge>
          {pullRequest.reviewDecision ? (
            <Badge variant="outline">{reviewDecisionLabel(pullRequest.reviewDecision)}</Badge>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-4">
          {snapshotMessage ? (
            <Alert>
              <AlertDescription>{snapshotMessage}</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-4 lg:flex-row">
            <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Branches
              </p>
              <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
                {pullRequest.headRefName} → {pullRequest.baseRefName}
              </p>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Created {formatRelativeTime(pullRequest.createdAt)}
              </p>
              {pullRequest.mergeStateStatus ? (
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  Merge status: {pullRequest.mergeStateStatus}
                </p>
              ) : null}
            </section>

            <section className="flex min-w-0 flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Checks
              </p>
              {pullRequest.checks && pullRequest.checks.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  {pullRequest.checks.slice(0, 3).map((check) => (
                    <div
                      key={`${check.workflowName ?? "check"}:${check.name}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)]/70 bg-[var(--background)] px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <StatusDot
                          pulse={check.status === "pending"}
                          size="sm"
                          tone={checkTone(check.status)}
                        />
                        <span className="truncate text-sm text-[var(--foreground)]">
                          {check.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                        {checkLabel(check.status)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                  No check data is available for this pull request yet.
                </p>
              )}
            </section>
          </div>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Check Runs
            </p>
            {pullRequest.checks && pullRequest.checks.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                {pullRequest.checks.map((check) => (
                  <button
                    key={`${check.workflowName ?? "check-run"}:${check.name}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)]/70 bg-[var(--background)] px-3 py-2 text-left transition hover:bg-[var(--surface-hover)]"
                    disabled={!check.detailsUrl}
                    onClick={() => {
                      if (!check.detailsUrl) {
                        return;
                      }

                      window.open(check.detailsUrl, "_blank", "noopener,noreferrer");
                    }}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <StatusDot
                        pulse={check.status === "pending"}
                        size="sm"
                        tone={checkTone(check.status)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-[var(--foreground)]">
                          {check.name}
                        </span>
                        <span className="block truncate text-xs text-[var(--muted-foreground)]">
                          {check.workflowName ?? "Check run"}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                      {check.detailsUrl ? "Open" : checkLabel(check.status)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                description="Check runs will appear here when the provider includes them for this pull request."
                size="sm"
                title="No checks available"
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
