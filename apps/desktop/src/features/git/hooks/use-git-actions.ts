import type { GitPullRequestSummary, WorkspaceMode } from "@lifecycle/contracts";
import { useEffect, useState } from "react";
import { commitGit, createGitPullRequest, mergeGitPullRequest, pushGit, stageGitFiles } from "../api";
import { useCurrentGitPullRequest, useGitLog, useGitStatus } from "../hooks";

export interface UseGitActionsOptions {
  onCommitComplete: () => void;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  workspaceId: string;
  workspaceMode: WorkspaceMode;
  worktreePath: string | null;
}

export interface UseGitActionsResult {
  actionError: string | null;
  branchPullRequest: ReturnType<typeof useCurrentGitPullRequest>["data"] | null;
  gitStatus: ReturnType<typeof useGitStatus>["data"] | undefined;
  gitStatusQuery: ReturnType<typeof useGitStatus>;
  handleCommit: (message: string, pushAfterCommit: boolean) => Promise<void>;
  handleCreatePullRequest: () => Promise<void>;
  handleMergePullRequest: (pullRequestNumber: number) => Promise<void>;
  handlePushBranch: () => Promise<void>;
  handleShowChanges: () => Promise<void>;
  isCommitting: boolean;
  isCreatingPullRequest: boolean;
  isLoading: boolean;
  isMergingPullRequest: boolean;
  isPushingBranch: boolean;
}

export function useGitActions({
  onCommitComplete,
  onOpenPullRequest,
  workspaceId,
  workspaceMode,
  worktreePath,
}: UseGitActionsOptions): UseGitActionsResult {
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCreatingPullRequest, setIsCreatingPullRequest] = useState(false);
  const [isMergingPullRequest, setIsMergingPullRequest] = useState(false);
  const [isPushingBranch, setIsPushingBranch] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const supportsChanges = workspaceMode === "local" && worktreePath !== null;

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

  const gitStatusQuery = useGitStatus(supportsChanges ? workspaceId : null, {
    polling: documentVisible,
  });
  const gitLogQuery = useGitLog(null, 50, { polling: false });
  const currentPullRequestQuery = useCurrentGitPullRequest(workspaceId, {
    polling: documentVisible,
  });

  async function refreshPullRequestState(): Promise<void> {
    await Promise.all([
      gitStatusQuery.refresh(),
      gitLogQuery.refresh(),
      currentPullRequestQuery.refresh(),
    ]);
  }

  async function handlePushBranch(): Promise<void> {
    setActionError(null);
    setIsPushingBranch(true);
    try {
      await pushGit(workspaceId);
      await refreshPullRequestState();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPushingBranch(false);
    }
  }

  async function handleCommit(message: string, pushAfterCommit: boolean): Promise<void> {
    let committed = false;
    setActionError(null);
    setIsCommitting(true);

    try {
      await commitGit(workspaceId, message);
      committed = true;

      if (pushAfterCommit) {
        setIsPushingBranch(true);
        try {
          await pushGit(workspaceId);
        } finally {
          setIsPushingBranch(false);
        }
      }

      await refreshPullRequestState();
      onCommitComplete();
    } catch (error) {
      if (committed) {
        await refreshPullRequestState().catch(() => undefined);
      }
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleCreatePullRequest(): Promise<void> {
    setActionError(null);
    setIsCreatingPullRequest(true);
    try {
      const pullRequest = await createGitPullRequest(workspaceId);
      await refreshPullRequestState();
      onOpenPullRequest(pullRequest);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingPullRequest(false);
    }
  }

  async function handleMergePullRequest(pullRequestNumber: number): Promise<void> {
    setActionError(null);
    setIsMergingPullRequest(true);
    try {
      const pullRequest = await mergeGitPullRequest(workspaceId, pullRequestNumber);
      await refreshPullRequestState();
      onOpenPullRequest(pullRequest);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMergingPullRequest(false);
    }
  }

  async function handleShowChanges(): Promise<void> {
    const unstaged = (gitStatusQuery.data?.files ?? []).filter((f) => f.unstaged);
    if (unstaged.length > 0) {
      await stageGitFiles(workspaceId, unstaged.map((f) => f.path));
      await gitStatusQuery.refresh();
    }
  }

  return {
    actionError,
    branchPullRequest: currentPullRequestQuery.data ?? null,
    gitStatus: gitStatusQuery.data,
    gitStatusQuery,
    handleCommit,
    handleCreatePullRequest,
    handleMergePullRequest,
    handlePushBranch,
    handleShowChanges,
    isCommitting,
    isCreatingPullRequest,
    isLoading: gitStatusQuery.isLoading || currentPullRequestQuery.isLoading,
    isMergingPullRequest,
    isPushingBranch,
  };
}
