import type { GitPullRequestSummary } from "@lifecycle/contracts";
import { useWorkspaceClient } from "@lifecycle/workspace/react";
import {
  Button,
  OptionList,
  type OptionListItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  Switch,
} from "@lifecycle/ui";
import { ArrowUp, GitBranch, GitCommitHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGitActions } from "@/features/git/hooks/use-git-actions";
import {
  buildWorkspaceGitActionState,
  type WorkspaceGitActionStateKind,
} from "@/features/git/lib/workspace-git-action-state";
import { useCurrentGitPullRequest, useGitStatus } from "@/features/git/hooks";
import { useWorkspace } from "@/store";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type CommitFlow = "commit" | "commit_and_push";

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

function stagedSummary(
  gitStatus: {
    files: Array<{
      staged: boolean;
      stats: { insertions: number | null; deletions: number | null };
    }>;
  } | null,
) {
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

// ---------------------------------------------------------------------------
// GitActionPopover — the commit dialog, self-contained via useGitActions.
// ---------------------------------------------------------------------------

interface GitActionPopoverProps {
  onOpenChange: (open: boolean) => void;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  workspaceId: string;
}

export function GitActionPopover({
  onOpenChange,
  onOpenPullRequest,
  workspaceId,
}: GitActionPopoverProps) {
  const workspace = useWorkspace(workspaceId);
  const client = useWorkspaceClient();
  const [commitMessage, setCommitMessage] = useState("");
  const [commitFlow, setCommitFlow] = useState<CommitFlow>("commit_and_push");
  const [includeUnstaged, setIncludeUnstaged] = useState(false);
  const [isStaging, setIsStaging] = useState(false);

  const gitActions = useGitActions({
    onCommitComplete: () => {
      setCommitMessage("");
    },
    onOpenPullRequest: (pr) => {
      onOpenChange(false);
      onOpenPullRequest(pr);
    },
    workspaceId,
  });

  const actionState = useMemo(
    () =>
      buildWorkspaceGitActionState(
        gitActions.gitStatus ?? null,
        gitActions.branchPullRequest ?? null,
        { isLoading: gitActions.isLoading },
      ),
    [gitActions.branchPullRequest, gitActions.gitStatus, gitActions.isLoading],
  );

  const isBusy =
    isStaging ||
    gitActions.isCommitting ||
    gitActions.isCreatingPullRequest ||
    gitActions.isMergingPullRequest ||
    gitActions.isPushingBranch;

  // Reset form when action state kind changes (e.g. after a successful commit).
  const prevKindRef = useRef(actionState.kind);
  useEffect(() => {
    if (prevKindRef.current !== actionState.kind) {
      prevKindRef.current = actionState.kind;
      setCommitMessage("");
    }
  }, [actionState.kind]);

  const handleStageAll = useCallback(async () => {
    if (!client || !workspace) {
      return;
    }
    const files = gitActions.gitStatusQuery.data?.files ?? [];
    const unstaged = files.filter((f) => f.unstaged);
    if (unstaged.length > 0) {
      setIsStaging(true);
      try {
        await client.stageGitFiles(
          workspace,
          unstaged.map((f) => f.path),
        );
        await gitActions.gitStatusQuery.refetch();
      } finally {
        setIsStaging(false);
      }
    }
  }, [gitActions.gitStatusQuery.data, gitActions.gitStatusQuery.refetch, client, workspace]);

  const handleContinue = useCallback(async () => {
    switch (actionState.kind) {
      case "needs_stage":
        await handleStageAll();
        break;
      case "needs_commit": {
        const msg = commitMessage.trim();
        if (!msg) return;
        if (includeUnstaged) {
          await handleStageAll();
        }
        await gitActions.handleCommit(msg, commitFlow === "commit_and_push");
        break;
      }
      case "needs_push":
        await gitActions.handlePushBranch();
        break;
      case "ready_to_create_pull_request":
        await gitActions.handleCreatePullRequest();
        break;
      case "ready_to_merge":
        if (actionState.pullRequest) {
          await gitActions.handleMergePullRequest(actionState.pullRequest.number);
        }
        break;
    }
  }, [actionState, commitFlow, commitMessage, gitActions, handleStageAll]);

  if (HIDDEN.has(actionState.kind)) {
    return (
      <PopoverContent
        align="end"
        className="w-[22rem] rounded-2xl border-[var(--border)] bg-[var(--background)] p-3.5 shadow-[0_20px_64px_rgba(0,0,0,0.18)]"
        side="bottom"
        sideOffset={8}
      >
        <p className="text-[13px] text-[var(--muted-foreground)]">{actionState.description}</p>
      </PopoverContent>
    );
  }

  const canPushAfterCommit = actionState.primaryAction.kind === "commit_and_push";
  const hasCommitMessage = commitMessage.trim().length > 0;
  const branch = gitActions.gitStatus?.branch ?? null;
  const summary =
    actionState.kind === "needs_commit" ? stagedSummary(gitActions.gitStatus ?? null) : null;
  const continueDisabled = isBusy || (actionState.kind === "needs_commit" && !hasCommitMessage);

  function continueLabel(): string {
    if (isStaging || gitActions.isCommitting || gitActions.isPushingBranch) return "Working...";
    if (gitActions.isCreatingPullRequest) return "Creating...";
    if (gitActions.isMergingPullRequest) return "Merging...";
    return "Continue";
  }

  return (
    <PopoverContent
      align="end"
      className="w-[22rem] rounded-2xl border-[var(--border)] bg-[var(--background)] p-3.5 shadow-[0_20px_64px_rgba(0,0,0,0.18)]"
      side="bottom"
      sideOffset={8}
    >
      <div className="space-y-3">
        <p className="text-[13px] font-semibold text-[var(--foreground)]">{actionState.title}</p>

        {gitActions.actionError && (
          <div
            className="rounded-xl border border-[var(--destructive)]/30 bg-[var(--destructive)]/8 px-3 py-2 text-[12px] text-[var(--destructive)]"
            role="alert"
          >
            {gitActions.actionError}
          </div>
        )}

        {actionState.kind === "needs_commit" && (
          <>
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
                            <span className="text-[var(--git-status-added)]">
                              +{summary.insertions}
                            </span>
                          )}
                          {summary.insertions > 0 && summary.deletions > 0 && " "}
                          {summary.deletions > 0 && (
                            <span className="text-[var(--git-status-deleted)]">
                              -{summary.deletions}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <p className="text-[12px] font-medium text-[var(--foreground)]">Commit message</p>
              <textarea
                autoFocus
                className="flex min-h-[72px] w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                onChange={(event) => setCommitMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && hasCommitMessage && !isBusy) {
                    event.preventDefault();
                    void handleContinue();
                  }
                }}
                placeholder="Leave blank to use default message"
                rows={3}
                value={commitMessage}
              />
            </div>

            {canPushAfterCommit && (
              <div className="space-y-1.5">
                <p className="text-[12px] font-medium text-[var(--foreground)]">Next steps</p>
                <OptionList
                  items={COMMIT_FLOW_OPTIONS}
                  onChange={setCommitFlow}
                  value={commitFlow}
                />
              </div>
            )}

            {actionState.hasUnstagedChanges && (
              <label className="flex items-center justify-between gap-2">
                <span className="text-[12px] text-[var(--foreground)]">Include unstaged</span>
                <Switch checked={includeUnstaged} onCheckedChange={setIncludeUnstaged} />
              </label>
            )}
          </>
        )}

        {actionState.kind !== "needs_commit" && (
          <p className="text-[12px] text-[var(--muted-foreground)]">{actionState.description}</p>
        )}

        {actionState.kind === "ready_to_merge" && actionState.pullRequest && (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
            <p className="truncate text-[13px] font-medium text-[var(--foreground)]">
              {actionState.pullRequest.title}
            </p>
            <p className="mt-0.5 text-[12px] text-[var(--muted-foreground)]">
              #{actionState.pullRequest.number} &middot; {actionState.pullRequest.headRefName}{" "}
              &rarr; {actionState.pullRequest.baseRefName}
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            disabled={isBusy}
            onClick={() => onOpenChange(false)}
            size="default"
            variant="ghost"
          >
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
    </PopoverContent>
  );
}

// ---------------------------------------------------------------------------
// GitActionButton — toolbar trigger + popover.
// ---------------------------------------------------------------------------

interface GitActionButtonProps {
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  workspaceId: string;
  worktreePath: string | null;
}

export function GitActionButton({
  onOpenPullRequest,
  workspaceId,
  worktreePath,
}: GitActionButtonProps) {
  const [open, setOpen] = useState(false);
  const gitStatusQuery = useGitStatus(worktreePath ? workspaceId : null);
  const branchPullRequestQuery = useCurrentGitPullRequest(worktreePath ? workspaceId : null);

  const actionState = useMemo(
    () =>
      buildWorkspaceGitActionState(
        gitStatusQuery.data ?? null,
        branchPullRequestQuery.data ?? null,
        {
          isLoading: gitStatusQuery.isLoading || branchPullRequestQuery.isLoading,
        },
      ),
    [
      branchPullRequestQuery.data,
      branchPullRequestQuery.isLoading,
      gitStatusQuery.data,
      gitStatusQuery.isLoading,
    ],
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button disabled={actionState.primaryAction.kind === "disabled"} size="sm" variant="glass">
          {actionState.kind === "loading" ? (
            <Spinner className="size-3.5" />
          ) : (
            <GitCommitHorizontal className="size-3.5" strokeWidth={2.2} />
          )}
          <span>{actionState.primaryAction.label}</span>
        </Button>
      </PopoverTrigger>
      <GitActionPopover
        onOpenChange={setOpen}
        onOpenPullRequest={onOpenPullRequest}
        workspaceId={workspaceId}
      />
    </Popover>
  );
}
