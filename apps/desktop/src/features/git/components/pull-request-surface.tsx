import type {
  GitBranchPullRequestResult,
  GitPullRequestCheckStatus,
  GitPullRequestDetailResult,
  GitPullRequestMergeable,
  GitPullRequestState,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import {
  Alert,
  AlertDescription,
  Button,
  EmptyState,
  StatusDot,
  type StatusDotTone,
} from "@lifecycle/ui";
import { useMemo } from "react";
import { formatRelativeTime } from "../../../lib/format";
import { useCurrentGitPullRequest, useGitPullRequest, useGitPullRequests } from "../hooks";

interface PullRequestSurfaceProps {
  pullRequest: GitPullRequestSummary;
  workspaceId: string;
}

interface ResolvePullRequestSurfaceStateInput {
  currentLoading: boolean;
  currentPullRequestResult: GitBranchPullRequestResult | undefined;
  detailLoading: boolean;
  detailResult: GitPullRequestDetailResult | undefined;
  listLoading?: boolean;
  listPullRequests?: GitPullRequestSummary[];
  listSupportMessage?: string | null;
  snapshot: GitPullRequestSummary;
}

interface PullRequestSurfaceState {
  currentBranchPullRequestNumber: number | null;
  pullRequest: GitPullRequestSummary;
  snapshotMessage: string | null;
}

type SurfaceTone = "danger" | "muted" | "success" | "warning";

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

function toneClassName(tone: SurfaceTone): string {
  switch (tone) {
    case "success":
      return "border-[color-mix(in_srgb,var(--git-status-added)_35%,transparent)] text-[var(--git-status-added)]";
    case "warning":
      return "border-[color-mix(in_srgb,var(--git-status-modified)_35%,transparent)] text-[var(--git-status-modified)]";
    case "danger":
      return "border-[color-mix(in_srgb,var(--destructive)_35%,transparent)] text-[var(--destructive)]";
    default:
      return "border-[var(--border)] text-[var(--muted-foreground)]";
  }
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

function stateTone(state: GitPullRequestState): SurfaceTone {
  switch (state) {
    case "merged":
      return "success";
    case "closed":
      return "muted";
    default:
      return "warning";
  }
}

function mergeableLabel(mergeable: GitPullRequestMergeable): string {
  switch (mergeable) {
    case "mergeable":
      return "Mergeable";
    case "conflicting":
      return "Conflicting";
    default:
      return "Mergeability unknown";
  }
}

function mergeableTone(mergeable: GitPullRequestMergeable): SurfaceTone {
  switch (mergeable) {
    case "mergeable":
      return "success";
    case "conflicting":
      return "danger";
    default:
      return "muted";
  }
}

function reviewDecisionLabel(reviewDecision: GitPullRequestSummary["reviewDecision"]): string {
  return reviewDecision ? reviewDecision.replaceAll("_", " ") : "No decision";
}

function checksSummary(checks: GitPullRequestSummary["checks"]): string {
  if (!checks || checks.length === 0) {
    return "No provider check data is available for this pull request yet.";
  }

  const counts = {
    failed: 0,
    neutral: 0,
    pending: 0,
    success: 0,
  };

  for (const check of checks) {
    counts[check.status] += 1;
  }

  const parts = [
    counts.success > 0 ? `${counts.success} passing` : null,
    counts.pending > 0 ? `${counts.pending} running` : null,
    counts.failed > 0 ? `${counts.failed} failing` : null,
    counts.neutral > 0 ? `${counts.neutral} neutral` : null,
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join(" · ") : `${checks.length} checks reported`;
}

function checkActionLabel(detailsUrl: string | null, status: GitPullRequestCheckStatus): string {
  return detailsUrl ? "Open" : checkLabel(status);
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

  return `Showing the last known snapshot for PR #${snapshot.number}. It may no longer be available from the provider.`;
}

export function resolvePullRequestSurfaceState({
  currentLoading,
  currentPullRequestResult,
  detailLoading,
  detailResult,
  listLoading = false,
  listPullRequests,
  listSupportMessage = null,
  snapshot,
}: ResolvePullRequestSurfaceStateInput): PullRequestSurfaceState {
  const livePullRequest =
    (detailResult?.pullRequest?.number === snapshot.number ? detailResult.pullRequest : null) ??
    (currentPullRequestResult?.pullRequest?.number === snapshot.number
      ? currentPullRequestResult.pullRequest
      : null) ??
    listPullRequests?.find((pullRequest) => pullRequest.number === snapshot.number) ??
    null;
  const currentBranchPullRequestNumber = currentPullRequestResult?.pullRequest?.number ?? null;
  const supportMessage =
    detailResult?.support.message ??
    currentPullRequestResult?.support.message ??
    listSupportMessage;

  return {
    currentBranchPullRequestNumber,
    pullRequest: livePullRequest ?? snapshot,
    snapshotMessage: liveSnapshotMessage(
      currentLoading || detailLoading || listLoading,
      snapshot,
      livePullRequest,
      supportMessage,
    ),
  };
}

function FactCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--panel)] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {label}
      </p>
      <p className="mt-1.5 text-sm text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function SurfaceChip({ label, tone }: { label: string; tone: SurfaceTone }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] ${toneClassName(
        tone,
      )}`}
    >
      {label}
    </span>
  );
}

export function PullRequestSurface({
  pullRequest: snapshot,
  workspaceId,
}: PullRequestSurfaceProps) {
  const pullRequestsQuery = useGitPullRequests(workspaceId);
  const currentPullRequestQuery = useCurrentGitPullRequest(workspaceId);
  const detailPullRequestQuery = useGitPullRequest(workspaceId, snapshot.number);
  const surfaceState = useMemo(
    () =>
      resolvePullRequestSurfaceState({
        currentLoading: currentPullRequestQuery.isLoading,
        currentPullRequestResult: currentPullRequestQuery.data,
        detailLoading: detailPullRequestQuery.isLoading,
        detailResult: detailPullRequestQuery.data,
        listLoading: pullRequestsQuery.isLoading,
        listPullRequests: pullRequestsQuery.data?.pullRequests,
        listSupportMessage: pullRequestsQuery.data?.support.message ?? null,
        snapshot,
      }),
    [
      currentPullRequestQuery.data,
      currentPullRequestQuery.isLoading,
      detailPullRequestQuery.data,
      detailPullRequestQuery.isLoading,
      pullRequestsQuery.data?.pullRequests,
      pullRequestsQuery.data?.support.message,
      pullRequestsQuery.isLoading,
      snapshot,
    ],
  );
  const pullRequest = surfaceState.pullRequest;
  const currentBranchPullRequestNumber = surfaceState.currentBranchPullRequestNumber;
  const snapshotMessage = surfaceState.snapshotMessage;
  const checks = pullRequest.checks ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
      <header className="border-b border-[var(--border)] px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Pull Request
            </p>
            <h2 className="mt-2 text-xl font-semibold leading-snug text-[var(--foreground)]">
              {pullRequest.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--muted-foreground)]">
              #{pullRequest.number} opened by {pullRequest.author} · updated{" "}
              {formatRelativeTime(pullRequest.updatedAt)}
            </p>
          </div>
          <Button
            className="rounded-none"
            onClick={() => window.open(pullRequest.url, "_blank", "noopener,noreferrer")}
            size="sm"
            variant="outline"
          >
            Open on GitHub
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <SurfaceChip label={stateLabel(pullRequest.state)} tone={stateTone(pullRequest.state)} />
          <SurfaceChip
            label={mergeableLabel(pullRequest.mergeable)}
            tone={mergeableTone(pullRequest.mergeable)}
          />
          {pullRequest.isDraft ? <SurfaceChip label="Draft" tone="muted" /> : null}
          {currentBranchPullRequestNumber === pullRequest.number ? (
            <SurfaceChip label="Current Branch" tone="warning" />
          ) : null}
          {pullRequest.reviewDecision ? (
            <SurfaceChip
              label={reviewDecisionLabel(pullRequest.reviewDecision)}
              tone={pullRequest.reviewDecision === "changes_requested" ? "danger" : "muted"}
            />
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          {snapshotMessage ? (
            <Alert className="rounded-none">
              <AlertDescription>{snapshotMessage}</AlertDescription>
            </Alert>
          ) : null}

          <section className="border border-[var(--border)] bg-[var(--card)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Overview
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                Current branch mapping, review state, and merge readiness.
              </p>
            </div>
            <div className="grid gap-px bg-[var(--border)] sm:grid-cols-2 xl:grid-cols-4">
              <FactCell
                label="Branches"
                value={`${pullRequest.headRefName} → ${pullRequest.baseRefName}`}
              />
              <FactCell label="Merge status" value={pullRequest.mergeStateStatus ?? "Unknown"} />
              <FactCell label="Review" value={reviewDecisionLabel(pullRequest.reviewDecision)} />
              <FactCell
                label="Workspace branch"
                value={
                  currentBranchPullRequestNumber === pullRequest.number
                    ? "Checked out"
                    : "Not checked out"
                }
              />
              <FactCell label="Created" value={formatRelativeTime(pullRequest.createdAt)} />
              <FactCell label="Updated" value={formatRelativeTime(pullRequest.updatedAt)} />
              <FactCell label="Reported checks" value={String(checks.length)} />
              <FactCell label="Checks summary" value={checksSummary(pullRequest.checks)} />
            </div>
          </section>

          <section className="border border-[var(--border)] bg-[var(--card)]">
            <div className="border-b border-[var(--border)] px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                Check Runs
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {checksSummary(pullRequest.checks)}
              </p>
            </div>

            {checks.length > 0 ? (
              <div>
                {checks.map((check, index) => {
                  const interactive = Boolean(check.detailsUrl);
                  const className = `flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm transition-colors ${
                    index > 0 ? "border-t border-[var(--border)]" : ""
                  } ${
                    interactive
                      ? "hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                      : ""
                  }`;

                  const content = (
                    <>
                      <span className="flex min-w-0 items-start gap-3">
                        <StatusDot
                          pulse={check.status === "pending"}
                          size="sm"
                          tone={checkTone(check.status)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-[var(--foreground)]">
                            {check.name}
                          </span>
                          <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                            {check.workflowName ?? "Check run"}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-foreground)]">
                        {checkActionLabel(check.detailsUrl, check.status)}
                      </span>
                    </>
                  );

                  if (!interactive) {
                    return (
                      <div
                        className={className}
                        key={`${check.workflowName ?? "check"}:${check.name}`}
                      >
                        {content}
                      </div>
                    );
                  }

                  return (
                    <button
                      className={className}
                      key={`${check.workflowName ?? "check"}:${check.name}`}
                      onClick={() => {
                        window.open(check.detailsUrl!, "_blank", "noopener,noreferrer");
                      }}
                      type="button"
                    >
                      {content}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-10">
                <EmptyState
                  description="Check runs will appear here once the provider reports them for this pull request."
                  size="sm"
                  title="No checks available"
                />
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
