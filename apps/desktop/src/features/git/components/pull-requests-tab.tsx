import type { GitPullRequestListResult, GitPullRequestSummary } from "@lifecycle/contracts";
import { Badge, EmptyState, Loading } from "@lifecycle/ui";

import { GithubAvatar } from "./github-avatar";

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

function PullRequestRow({
  pullRequest,
  isCurrent,
  onOpenPullRequest,
}: {
  pullRequest: GitPullRequestSummary;
  isCurrent: boolean;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
}) {
  const statusText =
    pullRequest.mergeable === "conflicting"
      ? "Conflicting"
      : pullRequest.reviewDecision === "approved"
        ? "Approved"
        : pullRequest.reviewDecision === "changes_requested"
          ? "Changes requested"
          : pullRequest.mergeable === "mergeable"
            ? "Mergeable"
            : null;

  const statusColor =
    pullRequest.mergeable === "conflicting"
      ? "var(--status-danger)"
      : pullRequest.reviewDecision === "approved"
        ? "var(--status-success)"
        : pullRequest.reviewDecision === "changes_requested"
          ? "var(--status-danger)"
          : pullRequest.mergeable === "mergeable"
            ? "var(--status-info)"
            : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenPullRequest(pullRequest)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenPullRequest(pullRequest);
        }
      }}
      className="flex cursor-pointer gap-3 px-2.5 py-2.5 transition hover:bg-[var(--surface-hover)]"
      title={`Open pull request #${pullRequest.number}`}
    >
      <GithubAvatar
        name={pullRequest.author}
        email={`${pullRequest.author}@users.noreply.github.com`}
      />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-[13px] leading-snug text-[var(--foreground)]">
          {pullRequest.title}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
          <span className="truncate">
            #{pullRequest.number} · {pullRequest.author}
          </span>
          {pullRequest.isDraft && <Badge variant="muted">Draft</Badge>}
          {isCurrent && <Badge variant="info">Current</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs text-[var(--muted-foreground)]">
          {formatShortAge(pullRequest.updatedAt)}
        </span>
        {statusText && (
          <span
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium"
            style={{
              color: statusColor,
              backgroundColor: `color-mix(in srgb, ${statusColor ?? "transparent"} 10%, transparent)`,
            }}
          >
            {statusText}
          </span>
        )}
      </div>
    </div>
  );
}

export function PullRequestsTab({
  currentBranchPullRequestNumber,
  error,
  isLoading,
  result,
  onOpenPullRequest,
}: PullRequestsTabProps) {
  if (isLoading && !result) {
    return <Loading message="Loading pull requests..." />;
  }

  if (error) {
    return (
      <p className="text-xs text-[var(--destructive)]">
        Failed to load pull requests: {String(error)}
      </p>
    );
  }

  if (!result?.support.available) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          description={
            result?.support.message ??
            "Pull request listing will appear here once a provider is available."
          }
          size="sm"
          title="Pull requests unavailable"
        />
      </div>
    );
  }

  if (result.pullRequests.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          description="Open pull requests for this repository will appear here."
          size="sm"
          title="No open pull requests"
        />
      </div>
    );
  }

  return (
    <div className="-mx-2.5 flex flex-col divide-y divide-[var(--border)]">
      {result.pullRequests.map((pullRequest) => (
        <PullRequestRow
          key={pullRequest.number}
          pullRequest={pullRequest}
          isCurrent={currentBranchPullRequestNumber === pullRequest.number}
          onOpenPullRequest={onOpenPullRequest}
        />
      ))}
    </div>
  );
}
