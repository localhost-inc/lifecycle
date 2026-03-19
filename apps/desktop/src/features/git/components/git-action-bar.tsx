import type {
  GitBranchPullRequestResult,
  GitPullRequestSummary,
  GitStatusResult,
} from "@lifecycle/contracts";
import { Button, OptionList, type OptionListItem } from "@lifecycle/ui";
import { ArrowUp, GitCommitHorizontal, GitBranch } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildWorkspaceGitActionState,
  type WorkspaceGitActionStateKind,
} from "../lib/workspace-git-action-state";

interface GitActionBarProps {
  actionError: string | null;
  branchPullRequest: GitBranchPullRequestResult | null;
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
  onStageAll: () => Promise<void>;
}

type CommitFlow = "commit" | "commit_and_push";

const EXPANDABLE: ReadonlySet<WorkspaceGitActionStateKind> = new Set([
  "needs_commit",
  "needs_push",
  "ready_to_create_pull_request",
  "ready_to_merge",
]);

const COMMIT_FLOW_OPTIONS: readonly OptionListItem<CommitFlow>[] = [
  { icon: <GitCommitHorizontal className="size-4" />, label: "Commit", value: "commit" },
  { icon: <ArrowUp className="size-4" />, label: "Commit and push", value: "commit_and_push" },
];

const HIDDEN: ReadonlySet<WorkspaceGitActionStateKind> = new Set([
  "loading",
  "detached",
  "blocked_behind",
  "blocked_diverged",
  "no_pull_request_changes",
  "provider_unavailable",
]);

function stagedSummary(gitStatus: GitStatusResult | null): {
  fileCount: number;
  insertions: number;
  deletions: number;
} {
  const files = gitStatus?.files ?? [];
  const staged = files.filter((f) => f.staged);
  let insertions = 0;
  let deletions = 0;
  for (const f of staged) {
    insertions += f.stats.insertions ?? 0;
    deletions += f.stats.deletions ?? 0;
  }
  return { fileCount: staged.length, insertions, deletions };
}

export function GitActionBar({
  actionError,
  branchPullRequest,
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
  onStageAll,
}: GitActionBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitFlow, setCommitFlow] = useState<CommitFlow>("commit_and_push");

  const actionState = useMemo(
    () => buildWorkspaceGitActionState(gitStatus, branchPullRequest, { isLoading }),
    [branchPullRequest, gitStatus, isLoading],
  );

  const isBusy = isCommitting || isCreatingPullRequest || isMergingPullRequest || isPushingBranch;

  // Collapse when action state kind changes (e.g. after a successful commit).
  const prevKindRef = useRef(actionState.kind);
  useEffect(() => {
    if (prevKindRef.current !== actionState.kind) {
      prevKindRef.current = actionState.kind;
      setExpanded(false);
      setCommitMessage("");
    }
  }, [actionState.kind]);

  const handleBarClick = useCallback(() => {
    if (EXPANDABLE.has(actionState.kind)) {
      setExpanded(true);
      return;
    }

    if (actionState.kind === "needs_stage") {
      void onStageAll();
      return;
    }

    if (actionState.kind === "view_pull_request" && actionState.pullRequest) {
      onOpenPullRequest(actionState.pullRequest);
    }
  }, [actionState, onOpenPullRequest, onStageAll]);

  const handleCancel = useCallback(() => {
    setExpanded(false);
    setCommitMessage("");
  }, []);

  const handleContinue = useCallback(async () => {
    switch (actionState.kind) {
      case "needs_commit": {
        const msg = commitMessage.trim();
        if (!msg) return;
        await onCommit(msg, commitFlow === "commit_and_push");
        break;
      }
      case "needs_push":
        await onPushBranch();
        break;
      case "ready_to_create_pull_request":
        await onCreatePullRequest();
        break;
      case "ready_to_merge":
        if (actionState.pullRequest) {
          await onMergePullRequest(actionState.pullRequest.number);
        }
        break;
    }
  }, [actionState, commitFlow, commitMessage, onCommit, onCreatePullRequest, onMergePullRequest, onPushBranch]);

  if (HIDDEN.has(actionState.kind)) {
    return null;
  }

  const canPushAfterCommit = actionState.primaryAction.kind === "commit_and_push";
  const hasCommitMessage = commitMessage.trim().length > 0;
  const branch = gitStatus?.branch ?? null;
  const summary = actionState.kind === "needs_commit" ? stagedSummary(gitStatus) : null;

  function continueLabel(): string {
    if (isCommitting || isPushingBranch) return "Working...";
    if (isCreatingPullRequest) return "Creating...";
    if (isMergingPullRequest) return "Merging...";
    return "Continue";
  }

  const continueDisabled =
    isBusy || (actionState.kind === "needs_commit" && !hasCommitMessage);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-2.5 pb-2.5">
      <AnimatePresence initial={false} mode="popLayout">
        {expanded ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 12, scale: 0.97, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 12, scale: 0.97, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
            className="pointer-events-auto w-full"
          >
            <div className="space-y-3 rounded-2xl border border-[var(--border)]/50 bg-[var(--background)] p-3.5 shadow-lg">
              <p className="text-[13px] font-semibold text-[var(--foreground)]">
                {actionState.title}
              </p>

              {actionError && (
                <div
                  className="rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/8 px-3 py-2 text-[12px] text-[var(--destructive)]"
                  role="alert"
                >
                  {actionError}
                </div>
              )}

              {actionState.kind === "needs_commit" && (
                <>
                  {/* Branch + changes summary */}
                  {(branch || summary) && (
                    <div className="space-y-1">
                      {branch && (
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="text-[var(--muted-foreground)]">Branch</span>
                          <span className="ml-auto flex items-center gap-1.5 truncate text-[var(--foreground)]">
                            <GitBranch className="size-3" />
                            <span className="truncate">{branch}</span>
                          </span>
                        </div>
                      )}
                      {summary && summary.fileCount > 0 && (
                        <div className="flex items-center gap-2 text-[12px]">
                          <span className="text-[var(--muted-foreground)]">Changes</span>
                          <span className="ml-auto flex items-center gap-1.5">
                            <span className="text-[var(--foreground)]">
                              {summary.fileCount} {summary.fileCount === 1 ? "file" : "files"}
                            </span>
                            {(summary.insertions > 0 || summary.deletions > 0) && (
                              <span className="font-mono">
                                {summary.insertions > 0 && (
                                  <span className="text-[var(--git-status-added)]">+{summary.insertions}</span>
                                )}
                                {summary.insertions > 0 && summary.deletions > 0 && " "}
                                {summary.deletions > 0 && (
                                  <span className="text-[var(--git-status-deleted)]">-{summary.deletions}</span>
                                )}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Commit message */}
                  <div className="space-y-1.5">
                    <p className="text-[12px] font-medium text-[var(--foreground)]">
                      Commit message
                    </p>
                    <textarea
                      autoFocus
                      className="flex min-h-[72px] w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                      onChange={(event) => setCommitMessage(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && hasCommitMessage && !isBusy) {
                          event.preventDefault();
                          void handleContinue();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          handleCancel();
                        }
                      }}
                      placeholder="Leave blank to use default message"
                      rows={3}
                      value={commitMessage}
                    />
                  </div>

                  {/* Next steps */}
                  {canPushAfterCommit && (
                    <div className="space-y-1.5">
                      <p className="text-[12px] font-medium text-[var(--foreground)]">
                        Next steps
                      </p>
                      <OptionList
                        items={COMMIT_FLOW_OPTIONS}
                        onChange={setCommitFlow}
                        value={commitFlow}
                      />
                    </div>
                  )}

                  {actionState.hasUnstagedChanges && (
                    <p className="text-[11px] text-[var(--muted-foreground)]">
                      Only staged files will be included.
                    </p>
                  )}
                </>
              )}

              {actionState.kind !== "needs_commit" && (
                <p className="text-[12px] text-[var(--muted-foreground)]">
                  {actionState.description}
                </p>
              )}

              {actionState.kind === "ready_to_merge" && actionState.pullRequest && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                  <p className="truncate text-[13px] font-medium text-[var(--foreground)]">
                    {actionState.pullRequest.title}
                  </p>
                  <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
                    #{actionState.pullRequest.number} &middot;{" "}
                    {actionState.pullRequest.headRefName} &rarr;{" "}
                    {actionState.pullRequest.baseRefName}
                  </p>
                </div>
              )}

              {/* Action row */}
              <div className="flex items-center gap-2">
                <Button disabled={isBusy} onClick={handleCancel} size="default" variant="ghost">
                  Cancel
                </Button>
                <div className="flex-1" />
                <Button
                  disabled={continueDisabled}
                  onClick={() => void handleContinue()}
                  size="default"
                  variant="primary"
                >
                  {continueLabel()}
                </Button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="bar"
            initial={{ opacity: 0, y: -8, scale: 0.95, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, scale: 0.95, filter: "blur(4px)" }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
            className="pointer-events-auto flex justify-center pb-1"
          >
            <Button className="px-8" disabled={isBusy} onClick={handleBarClick} size="lg" variant="glass">
              {actionState.primaryAction.label}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
