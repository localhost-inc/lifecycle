import type {
  GitPullRequestCheckSummary,
  GitPullRequestListResult,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import { Badge, EmptyState } from "@lifecycle/ui";

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

function CheckDots({ checks }: { checks: GitPullRequestCheckSummary[] | null }) {
  if (!checks?.length) return null;

  const colors: Record<string, string> = {
    success: "var(--git-status-added)",
    failed: "var(--destructive)",
    pending: "var(--git-status-modified)",
    neutral: "var(--muted-foreground)",
  };

  const passing = checks.filter((c) => c.status === "success").length;
  const visible = checks.slice(0, 3);
  const overflow = checks.length - visible.length;

  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`${passing}/${checks.length} checks passing`}
    >
      {visible.map((check) => (
        <span
          key={check.name}
          className="text-[8px] leading-none"
          style={{ color: colors[check.status] ?? colors.neutral }}
        >
          ●
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[9px] leading-none text-[var(--muted-foreground)]">
          +{overflow}
        </span>
      )}
    </span>
  );
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
  const reviewText =
    pullRequest.reviewDecision === "approved"
      ? "Approved"
      : pullRequest.reviewDecision === "changes_requested"
        ? "Changes requested"
        : null;

  const reviewColor =
    pullRequest.reviewDecision === "approved"
      ? "var(--git-status-added)"
      : pullRequest.reviewDecision === "changes_requested"
        ? "var(--git-status-modified)"
        : undefined;

  const mergeText =
    pullRequest.mergeable === "mergeable"
      ? "Mergeable"
      : pullRequest.mergeable === "conflicting"
        ? "Conflicting"
        : null;

  const mergeColor =
    pullRequest.mergeable === "mergeable"
      ? "var(--git-status-added)"
      : pullRequest.mergeable === "conflicting"
        ? "var(--git-status-renamed)"
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
      className="flex cursor-pointer items-start gap-2 px-2.5 py-2 transition hover:bg-[var(--surface-hover)]"
      title={`Open pull request #${pullRequest.number}`}
    >
      <GithubAvatar
        name={pullRequest.author}
        email={`${pullRequest.author}@users.noreply.github.com`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1 text-xs text-[var(--muted-foreground)]">
          <span className="truncate">
            {pullRequest.author} · #{pullRequest.number}
          </span>
          {pullRequest.isDraft && <Badge variant="muted">Draft</Badge>}
          {isCurrent && <Badge variant="info">Current</Badge>}
          <span className="ml-auto shrink-0">{formatShortAge(pullRequest.updatedAt)}</span>
        </div>
        <p className="line-clamp-2 text-[13px] leading-snug text-[var(--foreground)]">
          {pullRequest.title}
        </p>
        <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
          <span className="truncate">
            {pullRequest.headRefName} → {pullRequest.baseRefName}
          </span>
          {reviewText && (
            <>
              <span>·</span>
              <span className="shrink-0" style={{ color: reviewColor }}>
                {reviewText}
              </span>
            </>
          )}
          <CheckDots checks={pullRequest.checks} />
          {mergeText && (
            <span className="ml-auto shrink-0" style={{ color: mergeColor }}>
              {mergeText}
            </span>
          )}
        </div>
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
