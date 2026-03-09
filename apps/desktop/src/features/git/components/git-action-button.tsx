import type {
  GitBranchPullRequestResult,
  GitPullRequestCheckStatus,
  GitStatusResult,
} from "@lifecycle/contracts";
import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SplitButton,
  SplitButtonPrimary,
  SplitButtonSecondary,
  StatusDot,
  type StatusDotTone,
} from "@lifecycle/ui";
import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  buildGitPullRequestPrimaryAction,
  buildGitPullRequestQuickState,
} from "../lib/pull-request-state";
import { resolveContainedOverlayWidth, useOverlayBoundary } from "../../../lib/overlay-boundary";

interface GitActionButtonProps {
  actionError: string | null;
  branchPullRequest: GitBranchPullRequestResult | null;
  defaultOpen?: boolean;
  gitStatus: GitStatusResult | null;
  isCommitting: boolean;
  isCreatingPullRequest: boolean;
  isLoading: boolean;
  isMergingPullRequest: boolean;
  isPushingBranch: boolean;
  onCommit: (message: string, pushAfterCommit: boolean) => Promise<void>;
  onCreatePullRequest: () => Promise<void>;
  onMergePullRequest: (pullRequestNumber: number) => Promise<void>;
  onOpenPullRequest: (url: string) => void;
  onPushBranch: () => Promise<void>;
  onShowChanges: () => void;
}

function branchMeta(branchPullRequest: GitBranchPullRequestResult | null): string | null {
  if (!branchPullRequest?.branch) {
    return null;
  }

  const baseRef = branchPullRequest.suggestedBaseRef;
  if (!baseRef) {
    return branchPullRequest.branch;
  }

  return `${branchPullRequest.branch} → ${baseRef}`;
}

interface GitActionMenuContentProps {
  actionError: string | null;
  branchPullRequest: GitBranchPullRequestResult | null;
  commitMessage: string;
  gitStatus: GitStatusResult | null;
  isCommitting: boolean;
  isCreatingPullRequest: boolean;
  isMergingPullRequest: boolean;
  isPushingBranch: boolean;
  onCommit: (pushAfterCommit: boolean) => Promise<void>;
  onCommitMessageChange: (value: string) => void;
  onCreatePullRequest: () => Promise<void>;
  onMergePullRequest: (pullRequestNumber: number) => Promise<void>;
  onOpenPullRequest: (url: string) => void;
  onPushBranch: () => Promise<void>;
  onShowChanges: () => void;
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

export function GitActionMenuContent({
  actionError,
  branchPullRequest,
  commitMessage,
  gitStatus,
  isCommitting,
  isCreatingPullRequest,
  isMergingPullRequest,
  isPushingBranch,
  onCommit,
  onCommitMessageChange,
  onCreatePullRequest,
  onMergePullRequest,
  onOpenPullRequest,
  onPushBranch,
  onShowChanges,
}: GitActionMenuContentProps) {
  const quickState = buildGitPullRequestQuickState(gitStatus, branchPullRequest);
  const checks = quickState.pullRequest?.checks ?? null;
  const meta = branchMeta(branchPullRequest);
  const hasCommitMessage = commitMessage.trim().length > 0;

  return (
    <>
      <div className="px-2 pb-1 pt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[var(--foreground)]">{quickState.title}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]">
              {quickState.description}
            </p>
          </div>
          {quickState.pullRequest && (
            <Badge variant="outline">#{quickState.pullRequest.number}</Badge>
          )}
        </div>
        {meta && <p className="mt-2 text-[12px] text-[var(--muted-foreground)]">{meta}</p>}
      </div>

      {actionError && (
        <div
          className="mx-2 mb-3 mt-2 rounded-2xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/8 px-3 py-2 text-[12px] text-[var(--destructive)]"
          role="alert"
        >
          {actionError}
        </div>
      )}

      {quickState.kind === "needs_commit" && (
        <div className="space-y-3 px-2 pb-2">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Commit message
            </p>
            <Input
              onChange={(event) => onCommitMessageChange(event.target.value)}
              placeholder="feat: summarize this workspace change"
              value={commitMessage}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!hasCommitMessage || isCommitting}
              onClick={() => void onCommit(false)}
              size="sm"
              variant="outline"
            >
              {isCommitting ? "Committing..." : "Commit"}
            </Button>
            <Button
              disabled={!hasCommitMessage || isCommitting || isPushingBranch}
              onClick={() => void onCommit(true)}
              size="sm"
            >
              {isCommitting || isPushingBranch ? "Working..." : "Commit & Push"}
            </Button>
            <Button onClick={onShowChanges} size="sm" variant="ghost">
              Review changes
            </Button>
          </div>
        </div>
      )}

      {quickState.kind === "needs_push" && (
        <div className="px-2 pb-2">
          <Button disabled={isPushingBranch} onClick={() => void onPushBranch()} size="sm">
            {isPushingBranch ? "Pushing..." : "Push branch"}
          </Button>
        </div>
      )}

      {quickState.kind === "ready_to_create" && (
        <div className="px-2 pb-2">
          <Button
            disabled={isCreatingPullRequest}
            onClick={() => void onCreatePullRequest()}
            size="sm"
          >
            {isCreatingPullRequest ? "Creating..." : "Create PR"}
          </Button>
        </div>
      )}

      {quickState.pullRequest && (
        <div className="space-y-3 px-2 pb-2">
          <div className="space-y-2 rounded-[18px] border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[var(--foreground)]">
                  {quickState.pullRequest.title}
                </p>
                <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">
                  {quickState.pullRequest.headRefName} → {quickState.pullRequest.baseRefName}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {quickState.pullRequest.isDraft && <Badge variant="muted">Draft</Badge>}
                {quickState.pullRequest.mergeable === "mergeable" && (
                  <Badge variant="success">Mergeable</Badge>
                )}
                {quickState.pullRequest.mergeable === "conflicting" && (
                  <Badge variant="info">Conflicting</Badge>
                )}
              </div>
            </div>
            {quickState.pullRequest.reviewDecision && (
              <p className="text-[12px] text-[var(--muted-foreground)]">
                Review: {quickState.pullRequest.reviewDecision.replaceAll("_", " ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => onOpenPullRequest(quickState.pullRequest!.url)}
                size="sm"
                variant="outline"
              >
                Open PR
              </Button>
              {quickState.kind === "ready_to_merge" && (
                <Button
                  disabled={isMergingPullRequest}
                  onClick={() => void onMergePullRequest(quickState.pullRequest!.number)}
                  size="sm"
                >
                  {isMergingPullRequest ? "Merging..." : "Merge PR"}
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Checks
            </p>
            {checks && checks.length > 0 ? (
              <div className="space-y-1 rounded-[18px] border border-[var(--border)] bg-[var(--panel)] px-2 py-2">
                {checks.slice(0, 6).map((check) => (
                  <a
                    className="flex items-center justify-between gap-3 rounded-[12px] px-2 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                    href={check.detailsUrl ?? undefined}
                    key={`${check.workflowName ?? "check"}:${check.name}`}
                    rel="noreferrer"
                    target={check.detailsUrl ? "_blank" : undefined}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <StatusDot
                        pulse={check.status === "pending"}
                        size="sm"
                        tone={checkTone(check.status)}
                      />
                      <span className="truncate">{check.name}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--muted-foreground)]">
                      {checkLabel(check.status)}
                    </span>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--muted-foreground)]">
                No check data is available for this pull request yet.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function GitActionButton({
  actionError,
  branchPullRequest,
  defaultOpen = false,
  gitStatus,
  isCommitting,
  isCreatingPullRequest,
  isLoading,
  isMergingPullRequest,
  isPushingBranch,
  onCommit,
  onCreatePullRequest,
  onMergePullRequest,
  onOpenPullRequest,
  onPushBranch,
  onShowChanges,
}: GitActionButtonProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [commitMessage, setCommitMessage] = useState("");
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const quickState = useMemo(
    () => buildGitPullRequestQuickState(gitStatus, branchPullRequest),
    [branchPullRequest, gitStatus],
  );
  const primaryAction = useMemo(
    () => buildGitPullRequestPrimaryAction(gitStatus, branchPullRequest),
    [branchPullRequest, gitStatus],
  );
  const hasCommitMessage = commitMessage.trim().length > 0;
  const isBusy = isCommitting || isCreatingPullRequest || isMergingPullRequest || isPushingBranch;
  const overlayBoundary = useOverlayBoundary(triggerRef);
  const contentWidth = resolveContainedOverlayWidth({
    boundaryWidth: overlayBoundary.width,
    idealWidth: 352,
  });

  async function handlePrimaryClick(): Promise<void> {
    if (primaryAction.kind === "commit" || primaryAction.kind === "commit_and_push") {
      setOpen(true);
      return;
    }

    if (primaryAction.kind === "push") {
      await onPushBranch();
      return;
    }

    if (primaryAction.kind === "create_pull_request") {
      await onCreatePullRequest();
      return;
    }

    if (primaryAction.kind === "merge_pull_request" && quickState.pullRequest) {
      await onMergePullRequest(quickState.pullRequest.number);
      return;
    }

    if (primaryAction.kind === "open_pull_request" && quickState.pullRequest) {
      onOpenPullRequest(quickState.pullRequest.url);
      return;
    }

    setOpen(true);
  }

  async function handleCommit(pushAfterCommit: boolean): Promise<void> {
    if (!hasCommitMessage) {
      return;
    }

    await onCommit(commitMessage.trim(), pushAfterCommit);
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <SplitButton ref={triggerRef}>
        <SplitButtonPrimary
          disabled={isBusy}
          onClick={() => void handlePrimaryClick()}
          title={quickState.title}
          variant="foreground"
        >
          {isLoading ? "Loading..." : primaryAction.label}
        </SplitButtonPrimary>
        <PopoverTrigger asChild>
          <SplitButtonSecondary aria-label="Show git actions" disabled={isBusy}>
            <ChevronDown className="size-3.5" strokeWidth={2.4} />
          </SplitButtonSecondary>
        </PopoverTrigger>
      </SplitButton>
      <PopoverContent
        align="end"
        className="rounded-[22px] border-[var(--border)] bg-[var(--card)] p-3 shadow-[0_20px_64px_rgba(0,0,0,0.18)]"
        container={overlayBoundary.element ?? undefined}
        side="bottom"
        sideOffset={8}
        style={{ maxWidth: "calc(100vw - 2rem)", width: `${contentWidth}px` }}
      >
        <GitActionMenuContent
          actionError={actionError}
          branchPullRequest={branchPullRequest}
          commitMessage={commitMessage}
          gitStatus={gitStatus}
          isCommitting={isCommitting}
          isCreatingPullRequest={isCreatingPullRequest}
          isMergingPullRequest={isMergingPullRequest}
          isPushingBranch={isPushingBranch}
          onCommit={handleCommit}
          onCommitMessageChange={setCommitMessage}
          onCreatePullRequest={onCreatePullRequest}
          onMergePullRequest={onMergePullRequest}
          onOpenPullRequest={onOpenPullRequest}
          onPushBranch={onPushBranch}
          onShowChanges={onShowChanges}
        />
      </PopoverContent>
    </Popover>
  );
}
