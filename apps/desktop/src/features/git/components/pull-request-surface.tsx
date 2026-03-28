import type {
  GitBranchPullRequestResult,
  GitPullRequestCheckSummary,
  GitPullRequestDetailResult,
  GitPullRequestSummary,
} from "@lifecycle/contracts";
import { useWorkspaceClient } from "@lifecycle/workspace/react";
import { Alert, AlertDescription, Badge } from "@lifecycle/ui";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowRight, ArrowUpRight, Check, Circle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatRelativeTime } from "@/lib/format";
import { measureAsyncPerformance } from "@/lib/performance";
import {
  useCurrentGitPullRequest,
  useGitPullRequest,
  useGitPullRequests,
} from "@/features/git/hooks";
import { useWorkspace } from "@/store";
import { useParsedGitPatchFiles } from "@/features/git/lib/parsed-patch-files";
import { GitPatchViewer } from "@/features/git/components/git-patch-viewer";
import { GithubAvatar } from "@/features/git/components/github-avatar";

interface PullRequestSurfaceProps {
  initialScrollTop?: number;
  onOpenFile?: (filePath: string) => void;
  onScrollTopChange?: (scrollTop: number) => void;
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
  success: "var(--status-success)",
  failed: "var(--destructive)",
  pending: "var(--status-warning)",
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
        <div key={check.name} className="flex items-center justify-between py-1.5">
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
  initialScrollTop = 0,
  onOpenFile,
  onScrollTopChange,
  pullRequest: snapshot,
  workspaceId,
}: PullRequestSurfaceProps) {
  const workspace = useWorkspace(workspaceId);
  const client = useWorkspaceClient();
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const pullRequestsQuery = useGitPullRequests(workspaceId, {
    polling: documentVisible,
  });
  const currentPullRequestQuery = useCurrentGitPullRequest(workspaceId, {
    polling: documentVisible,
  });
  const detailPullRequestQuery = useGitPullRequest(workspaceId, snapshot.number, {
    polling: documentVisible,
  });

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const syncDocumentVisible = () => {
      setDocumentVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", syncDocumentVisible);
    return () => {
      document.removeEventListener("visibilitychange", syncDocumentVisible);
    };
  }, []);
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
      ? "var(--status-success)"
      : pullRequest.reviewDecision === "changes_requested"
        ? "var(--status-danger)"
        : undefined;

  const mergeText =
    pullRequest.mergeable === "mergeable"
      ? "Mergeable"
      : pullRequest.mergeable === "conflicting"
        ? "Conflicting"
        : null;

  const mergeColor =
    pullRequest.mergeable === "mergeable"
      ? "var(--status-info)"
      : pullRequest.mergeable === "conflicting"
        ? "var(--status-danger)"
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

    if (!client || !workspace) {
      setIsDiffLoading(false);
      return;
    }

    void measureAsyncPerformance(
      `pull-request-surface.patch:${workspaceId}:${pullRequest.number}`,
      () => client.getGitPullRequestPatch(workspace, pullRequest.number),
    )
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
  }, [diffReloadKey, pullRequest.number, client, workspace, workspaceId]);
  const parsedFiles = useParsedGitPatchFiles(`pr-diff:${workspaceId}:${pullRequest.number}`, patch);
  const [checksExpanded, setChecksExpanded] = useState(false);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface)]">
      <header className="flex flex-col gap-0 border-b border-[var(--border)] px-5 pt-4 pb-0">
        {/* Section title row */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="app-panel-title flex cursor-pointer items-center gap-1.5 bg-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            onClick={() => openUrl(pullRequest.url)}
          >
            Pull Request #{pullRequest.number}
            <ArrowUpRight className="size-3" />
          </button>
          {pullRequest.isDraft && <Badge variant="muted">Draft</Badge>}
          {currentBranchPullRequestNumber === pullRequest.number && (
            <Badge variant="info">Current Branch</Badge>
          )}
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

          {(mergeText || reviewText) && (
            <div className="flex flex-col gap-1.5">
              <span className="app-panel-title text-[var(--muted-foreground)]">Status</span>
              <div className="flex items-center gap-1.5">
                {mergeText && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium"
                    style={{
                      color: mergeColor,
                      backgroundColor: `color-mix(in srgb, ${mergeColor ?? "transparent"} 10%, transparent)`,
                    }}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: mergeColor }}
                    />
                    {mergeText}
                  </span>
                )}
                {reviewText && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-medium"
                    style={{
                      color: reviewColor,
                      backgroundColor: `color-mix(in srgb, ${reviewColor ?? "transparent"} 10%, transparent)`,
                    }}
                  >
                    {reviewText}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="app-panel-title text-[var(--muted-foreground)]">Updated</span>
            <span className="text-[13px] text-[var(--muted-foreground)]">
              {formatRelativeTime(pullRequest.updatedAt)}
            </span>
          </div>
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

      <GitPatchViewer
        error={diffError}
        errorMessagePrefix="Failed to load diff"
        initialScrollTop={initialScrollTop}
        isLoading={isDiffLoading}
        loadingMessage="Loading diff..."
        onOpenFile={onOpenFile}
        onScrollTopChange={onScrollTopChange}
        parsedFiles={parsedFiles}
        patch={patch}
      />
    </div>
  );
}
