import type {
  GitBranchPullRequestResult,
  GitPullRequestCheckSummary,
  GitPullRequestDetailResult,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import { Alert, AlertDescription, Badge, Button, diffTheme, useTheme } from "@lifecycle/ui";
import { parsePatchFiles } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import { useEffect, useMemo, useState } from "react";
import { formatRelativeTime } from "../../../lib/format";
import { getGitRefDiffPatch } from "../api";
import { useCurrentGitPullRequest, useGitPullRequest, useGitPullRequests } from "../hooks";
import { DEFAULT_GIT_DIFF_STYLE, type GitDiffStyle } from "../lib/diff-style";
import { buildPatchRenderCacheKey } from "../lib/diff-virtualization";
import { DiffStyleToggle } from "./diff-style-toggle";
import { DiffRenderProvider } from "./diff-render-provider";
import { GithubAvatar } from "./github-avatar";
import { MultiFileDiffLayout } from "./multi-file-diff-layout";

interface PullRequestSurfaceProps {
  onOpenFile?: (filePath: string) => void;
  pullRequest: GitPullRequestSummary;
  workspaceId: string;
}

export interface ResolvePullRequestSurfaceStateInput {
  currentLoading: boolean;
  currentPullRequestResult: GitBranchPullRequestResult | undefined;
  detailLoading: boolean;
  detailResult: GitPullRequestDetailResult | undefined;
  listLoading?: boolean;
  listPullRequests?: GitPullRequestSummary[];
  listSupportMessage?: string | null;
  snapshot: GitPullRequestSummary;
}

export interface PullRequestSurfaceState {
  currentBranchPullRequestNumber: number | null;
  pullRequest: GitPullRequestSummary;
  snapshotMessage: string | null;
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
  const visible = checks.slice(0, 5);
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
        <span className="text-[9px] leading-none text-[var(--muted-foreground)]">+{overflow}</span>
      )}
    </span>
  );
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

export function PullRequestSurface({
  onOpenFile,
  pullRequest: snapshot,
  workspaceId,
}: PullRequestSurfaceProps) {
  const { resolvedAppearance, resolvedTheme } = useTheme();
  const [diffStyle, setDiffStyle] = useState<GitDiffStyle>(DEFAULT_GIT_DIFF_STYLE);
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

  // -- Diff state --
  const [patch, setPatch] = useState("");
  const [diffError, setDiffError] = useState<string | null>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPatch("");
    setDiffError(null);
    setIsDiffLoading(true);

    void getGitRefDiffPatch(workspaceId, pullRequest.baseRefName, pullRequest.headRefName)
      .then((result) => {
        if (!cancelled) setPatch(result);
      })
      .catch((err) => {
        if (!cancelled) setDiffError(String(err));
      })
      .finally(() => {
        if (!cancelled) setIsDiffLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pullRequest.number, pullRequest.baseRefName, pullRequest.headRefName, workspaceId]);

  const parsedFiles = useMemo(() => {
    if (!patch) return [];
    const cacheKey = buildPatchRenderCacheKey(
      `pr-diff:${workspaceId}:${pullRequest.number}`,
      patch,
    );
    try {
      return parsePatchFiles(patch, cacheKey).flatMap((p) => p.files);
    } catch {
      return null;
    }
  }, [patch, pullRequest.number, workspaceId]);

  const diffControlsDisabled = isDiffLoading || diffError !== null || patch.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
      <header className="border-b border-[var(--border)] px-4 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Pull Request
            </p>
            <h2 className="mt-2 text-base font-semibold leading-snug text-[var(--foreground)]">
              {pullRequest.title}
            </h2>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <GithubAvatar
                name={pullRequest.author}
                email={`${pullRequest.author}@users.noreply.github.com`}
                size="sm"
              />
              <span>
                {pullRequest.author} · #{pullRequest.number} · updated{" "}
                {formatRelativeTime(pullRequest.updatedAt)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
              <span className="font-mono text-[var(--foreground)]">{pullRequest.headRefName}</span>
              <span>→</span>
              <span className="font-mono text-[var(--foreground)]">{pullRequest.baseRefName}</span>
              {mergeText && (
                <>
                  <span className="ml-1">·</span>
                  <span className="shrink-0" style={{ color: mergeColor }}>
                    {mergeText}
                  </span>
                </>
              )}
              {reviewText && (
                <>
                  <span>·</span>
                  <span className="shrink-0" style={{ color: reviewColor }}>
                    {reviewText}
                  </span>
                </>
              )}
              <CheckDots checks={pullRequest.checks} />
              {pullRequest.isDraft && (
                <Badge variant="muted" className="ml-1">
                  Draft
                </Badge>
              )}
              {currentBranchPullRequestNumber === pullRequest.number && (
                <Badge variant="info" className="ml-0.5">
                  Current Branch
                </Badge>
              )}
            </div>
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

        {snapshotMessage ? (
          <Alert className="mt-3 rounded-none">
            <AlertDescription>{snapshotMessage}</AlertDescription>
          </Alert>
        ) : null}
      </header>

      <DiffRenderProvider theme={diffTheme(resolvedTheme)}>
        {isDiffLoading && !patch ? (
          <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
            Loading diff...
          </div>
        ) : diffError ? (
          <Alert className="m-5" variant="destructive">
            <AlertDescription>Failed to load diff: {diffError}</AlertDescription>
          </Alert>
        ) : !patch ? (
          <div className="flex flex-1 items-center justify-center px-8 text-sm text-[var(--muted-foreground)]">
            No diff to display.
          </div>
        ) : parsedFiles === null || parsedFiles.length === 0 ? (
          <div className="min-h-0 flex-1 overflow-auto pb-24">
            <PatchDiff
              patch={patch}
              options={{
                disableFileHeader: true,
                diffStyle,
                theme: diffTheme(resolvedTheme),
                themeType: resolvedAppearance,
              }}
            />
          </div>
        ) : (
          <MultiFileDiffLayout
            diffStyle={diffStyle}
            files={parsedFiles}
            onOpenFile={onOpenFile}
            theme={diffTheme(resolvedTheme)}
            themeType={resolvedAppearance}
          />
        )}
      </DiffRenderProvider>
      <DiffStyleToggle
        diffStyle={diffStyle}
        disabled={diffControlsDisabled}
        onChange={setDiffStyle}
      />
    </div>
  );
}
