import type { GitPullRequestListResult, GitPullRequestSummary } from "@lifecycle/contracts";
import { Badge, Button, EmptyState } from "@lifecycle/ui";

interface PullRequestsTabProps {
  currentBranchPullRequestNumber: number | null;
  error: unknown;
  isLoading: boolean;
  result: GitPullRequestListResult | null;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
}

function formatShortAge(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks}w`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

function mergeableBadgeVariant(mergeable: string): "info" | "muted" | "success" {
  if (mergeable === "mergeable") return "success";
  if (mergeable === "conflicting") return "info";
  return "muted";
}

export function PullRequestsTab({
  currentBranchPullRequestNumber,
  error,
  isLoading,
  result,
  onOpenPullRequest,
}: PullRequestsTabProps) {
  if (isLoading && !result) {
    return <p className="text-xs text-[var(--muted-foreground)]">Loading pull requests...</p>;
  }

  if (error) {
    return <p className="text-xs text-red-400">Failed to load pull requests: {String(error)}</p>;
  }

  if (!result?.support.available) {
    return (
      <EmptyState
        description={
          result?.support.message ??
          "Pull request listing will appear here once a provider is available."
        }
        size="sm"
        title="Pull requests unavailable"
      />
    );
  }

  if (result.pullRequests.length === 0) {
    return (
      <EmptyState
        description="Open pull requests for this repository will appear here."
        size="sm"
        title="No open pull requests"
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {result.pullRequests.map((pullRequest) => (
        <div
          key={pullRequest.number}
          className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-3"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-[var(--foreground)]">
                  {pullRequest.title}
                </p>
                {pullRequest.isDraft && <Badge variant="muted">Draft</Badge>}
                {currentBranchPullRequestNumber === pullRequest.number && (
                  <Badge variant="info">Current</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                #{pullRequest.number} · {pullRequest.author} ·{" "}
                {formatShortAge(pullRequest.updatedAt)}
              </p>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                {pullRequest.headRefName} → {pullRequest.baseRefName}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant={mergeableBadgeVariant(pullRequest.mergeable)}>
                  {pullRequest.mergeable === "mergeable"
                    ? "Mergeable"
                    : pullRequest.mergeable === "conflicting"
                      ? "Conflicting"
                      : "Unknown"}
                </Badge>
                {pullRequest.reviewDecision && (
                  <Badge variant="outline">{pullRequest.reviewDecision.replaceAll("_", " ")}</Badge>
                )}
              </div>
            </div>
            <Button onClick={() => onOpenPullRequest(pullRequest)} size="sm" variant="outline">
              Open
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
