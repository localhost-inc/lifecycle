import type {
  GitBranchPullRequestResult,
  GitPullRequestCheckSummary,
  GitPullRequestDetailResult,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import { Alert, AlertDescription, Badge, Button, diffTheme, useTheme } from "@lifecycle/ui";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowRight, ArrowUpRight, Check, Circle, X } from "lucide-react";
import { parsePatchFiles } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import { useEffect, useMemo, useState } from "react";
import { formatRelativeTime } from "../../../lib/format";
import { getGitPullRequestPatch } from "../api";
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

export function buildPullRequestDiffReloadKey(
  workspaceId: string,
  pullRequest: Pick<GitPullRequestSummary, "number" | "updatedAt">,
): string {
  return [workspaceId, pullRequest.number, pullRequest.updatedAt].join(":");
}

const checkStatusColors: Record<string, string> = {
  success: "var(--git-status-added)",
  failed: "var(--destructive)",
  pending: "var(--git-status-modified)",
  neutral: "var(--muted-foreground)",
};

function CheckStatusIcon({ status }: { status: string }) {
  const color = checkStatusColors[status] ?? checkStatusColors.neutral;

  if (status === "success") {
    return (
      <span className="relative flex size-3.5 shrink-0 items-center justify-center">
        <Circle className="absolute size-3.5" style={{ color }} strokeWidth={1.5} />
        <Check className="size-2" style={{ color }} strokeWidth={2.5} />
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="relative flex size-3.5 shrink-0 items-center justify-center">
        <Circle className="absolute size-3.5" style={{ color }} strokeWidth={1.5} />
        <X className="size-2" style={{ color }} strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <span className="relative flex size-3.5 shrink-0 items-center justify-center">
      <Circle className="size-2" style={{ color }} fill={color} strokeWidth={0} />
    </span>
  );
}

function ChecksSummary({ checks }: { checks: GitPullRequestCheckSummary[] | null }) {
  if (!checks?.length) return null;
  const passing = checks.filter((c) => c.status === "success").length;
  const failing = checks.filter((c) => c.status === "failed").length;
  const allPassing = passing === checks.length;

  return (
    <div className="flex items-center gap-1.5">
      <CheckStatusIcon status={allPassing ? "success" : failing > 0 ? "failed" : "pending"} />
      <span className="text-[13px] text-[var(--muted-foreground)]">
        {allPassing
          ? `${passing} passed`
          : failing > 0
            ? `${failing} failed`
            : `${passing}/${checks.length} passed`}
      </span>
    </div>
  );
}

function ChecksList({ checks }: { checks: GitPullRequestCheckSummary[] | null }) {
  if (!checks?.length) return null;

  return (
    <div className="flex flex-col">
      {checks.map((check) => (
        <div
          key={check.name}
          className="flex items-center justify-between py-1.5"
        >
          <div className="flex items-center gap-2.5">
            <CheckStatusIcon status={check.status} />
            <span className="text-[13px] text-[var(--muted-foreground)]">{check.name}</span>
          </div>
          {check.detailsUrl && (
            <a
              href={check.detailsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-mono text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Details
            </a>
          )}
        </div>
      ))}
    </div>
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
  const diffReloadKey = buildPullRequestDiffReloadKey(workspaceId, pullRequest);

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

    void getGitPullRequestPatch(workspaceId, pullRequest.number)
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
  }, [diffReloadKey, pullRequest.number, workspaceId]);

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
  const [checksExpanded, setChecksExpanded] = useState(false);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--background)]">
      <header className="flex flex-col gap-0 border-b border-[var(--border)] px-5 pt-4 pb-0">
        {/* Section title row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="app-panel-title text-[var(--muted-foreground)]">Pull Request</span>
            <span className="font-mono text-[11px] text-[var(--muted-foreground)]">
              #{pullRequest.number}
            </span>
            <span className="text-[11px] text-[var(--muted-foreground)]">
              · updated {formatRelativeTime(pullRequest.updatedAt)}
            </span>
            {pullRequest.isDraft && <Badge variant="muted">Draft</Badge>}
            {currentBranchPullRequestNumber === pullRequest.number && (
              <Badge variant="info">Current Branch</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {mergeText && (
              <div className="flex items-center gap-1.5">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: mergeColor }}
                />
                <span className="font-mono text-[11px] font-medium tracking-wide" style={{ color: mergeColor }}>
                  {mergeText}
                </span>
              </div>
            )}
            {reviewText && !mergeText && (
              <div className="flex items-center gap-1.5">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: reviewColor }}
                />
                <span className="font-mono text-[11px] font-medium tracking-wide" style={{ color: reviewColor }}>
                  {reviewText}
                </span>
              </div>
            )}
            <Button
              className="h-6 gap-1 rounded-md px-2.5 text-[11px]"
              onClick={() => openUrl(pullRequest.url)}
              size="sm"
              variant="outline"
            >
              Open on GitHub
              <ArrowUpRight className="size-3" />
            </Button>
          </div>
        </div>

        {/* PR title */}
        <h2 className="mt-3 text-lg font-medium leading-snug tracking-tight text-[var(--foreground)]">
          {pullRequest.title}
        </h2>

        {/* Branch flow */}
        <div className="mt-2.5 flex items-center gap-2">
          <span className="rounded bg-[var(--muted)] px-2 py-0.5 font-mono text-xs text-[var(--muted-foreground)]">
            {pullRequest.headRefName}
          </span>
          <ArrowRight className="size-3.5 text-[var(--muted-foreground)]" />
          <span className="rounded bg-[var(--muted)] px-2 py-0.5 font-mono text-xs text-[var(--muted-foreground)]">
            {pullRequest.baseRefName}
          </span>
        </div>

        {snapshotMessage ? (
          <Alert className="mt-3 rounded-none">
            <AlertDescription>{snapshotMessage}</AlertDescription>
          </Alert>
        ) : null}

        {/* Divider */}
        <div className="mt-3 border-t border-[var(--border)]" />

        {/* Meta row */}
        <div className="flex items-start gap-10 py-3">
          <div className="flex flex-col gap-1.5">
            <span className="app-panel-title text-[var(--muted-foreground)]">Author</span>
            <div className="flex items-center gap-2">
              <GithubAvatar
                name={pullRequest.author}
                email={`${pullRequest.author}@users.noreply.github.com`}
                size="md"
              />
              <span className="text-[13px] text-[var(--muted-foreground)]">
                {pullRequest.author}
              </span>
            </div>
          </div>

          {parsedFiles && parsedFiles.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="app-panel-title text-[var(--muted-foreground)]">Changes</span>
              <span className="font-mono text-[13px] text-[var(--muted-foreground)]">
                {parsedFiles.length} {parsedFiles.length === 1 ? "file" : "files"}
              </span>
            </div>
          )}

          {pullRequest.checks && pullRequest.checks.length > 0 && (
            <button
              type="button"
              className="flex cursor-pointer flex-col gap-1.5 bg-transparent text-left"
              onClick={() => setChecksExpanded((v) => !v)}
            >
              <span className="app-panel-title text-[var(--muted-foreground)]">Checks</span>
              <ChecksSummary checks={pullRequest.checks} />
            </button>
          )}

          {reviewText && (
            <div className="flex flex-col gap-1.5">
              <span className="app-panel-title text-[var(--muted-foreground)]">Review</span>
              <span className="text-[13px]" style={{ color: reviewColor }}>
                {reviewText}
              </span>
            </div>
          )}
        </div>

        {/* Checks detail list (toggle) */}
        {checksExpanded && pullRequest.checks && pullRequest.checks.length > 0 && (
          <>
            <div className="border-t border-[var(--border)]" />
            <div className="py-3">
              <ChecksList checks={pullRequest.checks} />
            </div>
          </>
        )}

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
