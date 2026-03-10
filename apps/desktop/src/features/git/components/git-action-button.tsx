import type {
  GitBranchPullRequestResult,
  GitPullRequestCheckStatus,
  GitPullRequestSummary,
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
import type { HostedOverlayAction } from "../../overlays/overlay-contract";
import { useHostedOverlay } from "../../overlays/use-hosted-overlay";
import { buildWorkspaceGitActionState } from "../lib/workspace-git-action-state";
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
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  onPushBranch: () => Promise<void>;
  onShowChanges: () => void;
}

function branchMeta(branch: string | null, suggestedBaseRef: string | null): string | null {
  if (!branch) {
    return null;
  }

  if (!suggestedBaseRef) {
    return branch;
  }

  return `${branch} → ${suggestedBaseRef}`;
}

interface GitActionMenuContentProps {
  actionError: string | null;
  autoFocusCommitMessage?: boolean;
  branchPullRequest: GitBranchPullRequestResult | null;
  commitMessage: string;
  gitStatus: GitStatusResult | null;
  isCommitting: boolean;
  isCreatingPullRequest: boolean;
  isLoading: boolean;
  isMergingPullRequest: boolean;
  isPushingBranch: boolean;
  onCommit: (pushAfterCommit: boolean) => Promise<void>;
  onCommitMessageChange: (value: string) => void;
  onCreatePullRequest: () => Promise<void>;
  onMergePullRequest: (pullRequestNumber: number) => Promise<void>;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
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
  autoFocusCommitMessage = false,
  branchPullRequest,
  commitMessage,
  gitStatus,
  isCommitting,
  isCreatingPullRequest,
  isLoading,
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
  const actionState = buildWorkspaceGitActionState(gitStatus, branchPullRequest, {
    isLoading,
  });
  const checks = actionState.pullRequest?.checks ?? null;
  const meta = branchMeta(actionState.branch, actionState.suggestedBaseRef);
  const hasCommitMessage = commitMessage.trim().length > 0;
  const canPushAfterCommit = actionState.primaryAction.kind === "commit_and_push";

  return (
    <>
      <div className="px-2 pb-1 pt-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[var(--foreground)]">{actionState.title}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--muted-foreground)]">
              {actionState.description}
            </p>
          </div>
          {actionState.pullRequest && (
            <Badge variant="outline">#{actionState.pullRequest.number}</Badge>
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

      {actionState.kind === "needs_stage" && (
        <div className="space-y-3 px-2 pb-2">
          <p className="text-[12px] text-[var(--muted-foreground)]">
            Stage the files you want to include from the Changes tab, then commit them here.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onShowChanges} size="sm" variant="outline">
              Open changes
            </Button>
          </div>
        </div>
      )}

      {actionState.kind === "needs_commit" && (
        <div className="space-y-3 px-2 pb-2">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
              Commit message
            </p>
            <Input
              autoFocus={autoFocusCommitMessage}
              onChange={(event) => onCommitMessageChange(event.target.value)}
              placeholder="feat: summarize this workspace change"
              value={commitMessage}
            />
          </div>
          {actionState.hasUnstagedChanges && (
            <p className="text-[12px] text-[var(--muted-foreground)]">
              Only staged files will be included. Unstaged edits remain in the working tree.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!hasCommitMessage || isCommitting || !actionState.hasStagedChanges}
              onClick={() => void onCommit(false)}
              size="sm"
              variant="outline"
            >
              {isCommitting ? "Committing..." : "Commit"}
            </Button>
            {canPushAfterCommit && (
              <Button
                disabled={
                  !hasCommitMessage ||
                  isCommitting ||
                  isPushingBranch ||
                  !actionState.hasStagedChanges
                }
                onClick={() => void onCommit(true)}
                size="sm"
              >
                {isCommitting || isPushingBranch ? "Working..." : "Commit & Push"}
              </Button>
            )}
            <Button onClick={onShowChanges} size="sm" variant="ghost">
              Review changes
            </Button>
          </div>
        </div>
      )}

      {actionState.kind === "needs_push" && (
        <div className="px-2 pb-2">
          <Button disabled={isPushingBranch} onClick={() => void onPushBranch()} size="sm">
            {isPushingBranch ? "Pushing..." : "Push branch"}
          </Button>
        </div>
      )}

      {actionState.kind === "ready_to_create_pull_request" && (
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

      {(actionState.kind === "blocked_behind" || actionState.kind === "blocked_diverged") && (
        <div className="px-2 pb-2">
          <p className="text-[12px] text-[var(--muted-foreground)]">
            Use a terminal session to sync the branch, then return here to push or manage the pull
            request.
          </p>
        </div>
      )}

      {actionState.pullRequest && (
        <div className="space-y-3 px-2 pb-2">
          <div className="space-y-2 rounded-[18px] border border-[var(--border)] bg-[var(--panel)] px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-[var(--foreground)]">
                  {actionState.pullRequest.title}
                </p>
                <p className="mt-1 text-[12px] text-[var(--muted-foreground)]">
                  {actionState.pullRequest.headRefName} → {actionState.pullRequest.baseRefName}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {actionState.pullRequest.isDraft && <Badge variant="muted">Draft</Badge>}
                {actionState.pullRequest.mergeable === "mergeable" && (
                  <Badge variant="success">Mergeable</Badge>
                )}
                {actionState.pullRequest.mergeable === "conflicting" && (
                  <Badge variant="info">Conflicting</Badge>
                )}
              </div>
            </div>
            {actionState.pullRequest.reviewDecision && (
              <p className="text-[12px] text-[var(--muted-foreground)]">
                Review: {actionState.pullRequest.reviewDecision.replaceAll("_", " ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => onOpenPullRequest(actionState.pullRequest!)}
                size="sm"
                variant="outline"
              >
                Open PR
              </Button>
              {actionState.kind === "ready_to_merge" && (
                <Button
                  disabled={isMergingPullRequest}
                  onClick={() => void onMergePullRequest(actionState.pullRequest!.number)}
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
  const actionState = useMemo(
    () => buildWorkspaceGitActionState(gitStatus, branchPullRequest, { isLoading }),
    [branchPullRequest, gitStatus, isLoading],
  );
  const isBusy = isCommitting || isCreatingPullRequest || isMergingPullRequest || isPushingBranch;
  const overlayBoundary = useOverlayBoundary(triggerRef);
  const contentWidth = resolveContainedOverlayWidth({
    boundaryWidth: overlayBoundary.width,
    idealWidth: 352,
  });
  const hostedOverlayPayload = useMemo(
    () => ({
      actionError,
      branchPullRequest,
      commitMessage,
      gitStatus,
      isCommitting,
      isCreatingPullRequest,
      isLoading,
      isMergingPullRequest,
      isPushingBranch,
      kind: "git-actions" as const,
      placement: {
        align: "end" as const,
        estimatedHeight: 560,
        gutter: 16,
        preferredWidth: 352,
        side: "bottom" as const,
        sideOffset: 8,
      },
      requiresWindowFocus: actionState.kind === "needs_commit",
    }),
    [
      actionError,
      branchPullRequest,
      commitMessage,
      gitStatus,
      isCommitting,
      isCreatingPullRequest,
      isLoading,
      isMergingPullRequest,
      isPushingBranch,
      actionState.kind,
    ],
  );
  const hostedOverlay = useHostedOverlay({
    anchorRef: triggerRef,
    onAction: (action: HostedOverlayAction) => {
      if (action.kind !== "git-actions") {
        return;
      }

      switch (action.action) {
        case "commit":
          void handleCommit(action.pushAfterCommit, action.message);
          return;
        case "create-pull-request":
          void onCreatePullRequest();
          return;
        case "merge-pull-request":
          void onMergePullRequest(action.pullRequestNumber);
          return;
        case "open-pull-request":
          if (actionState.pullRequest?.url === action.url) {
            onOpenPullRequest(actionState.pullRequest);
          }
          return;
        case "push-branch":
          void onPushBranch();
          return;
        case "show-changes":
          onShowChanges();
          return;
        default:
          return;
      }
    },
    onRequestClose: () => {
      setOpen(false);
    },
    open,
    payload: hostedOverlayPayload,
  });
  const usesHostedOverlay = hostedOverlay.hosted;

  async function handlePrimaryClick(): Promise<void> {
    if (actionState.primaryAction.kind === "show_changes") {
      onShowChanges();
      return;
    }

    if (
      actionState.primaryAction.kind === "commit" ||
      actionState.primaryAction.kind === "commit_and_push"
    ) {
      setOpen(true);
      return;
    }

    if (actionState.primaryAction.kind === "push") {
      await onPushBranch();
      return;
    }

    if (actionState.primaryAction.kind === "create_pull_request") {
      await onCreatePullRequest();
      return;
    }

    if (actionState.primaryAction.kind === "merge_pull_request" && actionState.pullRequest) {
      await onMergePullRequest(actionState.pullRequest.number);
      return;
    }

    if (actionState.primaryAction.kind === "open_pull_request" && actionState.pullRequest) {
      onOpenPullRequest(actionState.pullRequest);
      return;
    }

    setOpen(true);
  }

  async function handleCommit(
    pushAfterCommit: boolean,
    messageValue = commitMessage,
  ): Promise<void> {
    const nextMessage = messageValue.trim();
    if (nextMessage.length === 0) {
      return;
    }

    await onCommit(nextMessage, pushAfterCommit);
  }

  const splitButton = (
    <SplitButton ref={triggerRef}>
      <SplitButtonPrimary
        disabled={isBusy}
        onClick={() => void handlePrimaryClick()}
        title={actionState.title}
        variant="foreground"
      >
        {actionState.primaryAction.label}
      </SplitButtonPrimary>
      {usesHostedOverlay ? (
        <SplitButtonSecondary
          aria-label="Show git actions"
          disabled={isBusy}
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          <ChevronDown className="size-3.5" strokeWidth={2.4} />
        </SplitButtonSecondary>
      ) : (
        <PopoverTrigger asChild>
          <SplitButtonSecondary aria-label="Show git actions" disabled={isBusy}>
            <ChevronDown className="size-3.5" strokeWidth={2.4} />
          </SplitButtonSecondary>
        </PopoverTrigger>
      )}
    </SplitButton>
  );

  if (usesHostedOverlay) {
    return splitButton;
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      {splitButton}
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
          isLoading={isLoading}
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
