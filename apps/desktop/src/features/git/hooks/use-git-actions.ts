import type { GitPullRequestSummary, WorkspaceTarget } from "@lifecycle/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  commitGit,
  createGitPullRequest,
  mergeGitPullRequest,
  pushGit,
  stageGitFiles,
} from "@/features/git/api";
import { useCurrentGitPullRequest, useGitLog, useGitStatus } from "@/features/git/hooks";

export interface UseGitActionsOptions {
  onCommitComplete: () => void;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  workspaceId: string;
  workspaceTarget: WorkspaceTarget;
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
  workspaceTarget,
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
  const supportsChanges =
    (workspaceTarget === "local" || workspaceTarget === "docker") && worktreePath !== null;

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
  const gitStatus = gitStatusQuery.data;
  const refreshGitStatus = gitStatusQuery.refresh;
  const refreshGitLog = gitLogQuery.refresh;
  const branchPullRequest = currentPullRequestQuery.data ?? null;
  const refreshCurrentPullRequest = currentPullRequestQuery.refresh;

  const refreshPullRequestState = useCallback(async (): Promise<void> => {
    await Promise.all([refreshGitStatus(), refreshGitLog(), refreshCurrentPullRequest()]);
  }, [refreshCurrentPullRequest, refreshGitLog, refreshGitStatus]);

  const handlePushBranch = useCallback(async (): Promise<void> => {
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
  }, [refreshPullRequestState, workspaceId]);

  const handleCommit = useCallback(
    async (message: string, pushAfterCommit: boolean): Promise<void> => {
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
    },
    [onCommitComplete, refreshPullRequestState, workspaceId],
  );

  const handleCreatePullRequest = useCallback(async (): Promise<void> => {
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
  }, [onOpenPullRequest, refreshPullRequestState, workspaceId]);

  const handleMergePullRequest = useCallback(
    async (pullRequestNumber: number): Promise<void> => {
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
    },
    [onOpenPullRequest, refreshPullRequestState, workspaceId],
  );

  const handleShowChanges = useCallback(async (): Promise<void> => {
    const unstaged = (gitStatus?.files ?? []).filter((f) => f.unstaged);
    if (unstaged.length > 0) {
      await stageGitFiles(
        workspaceId,
        unstaged.map((f) => f.path),
      );
      await refreshGitStatus();
    }
  }, [gitStatus?.files, refreshGitStatus, workspaceId]);

  return useMemo(
    () => ({
      actionError,
      branchPullRequest,
      gitStatus,
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
    }),
    [
      actionError,
      branchPullRequest,
      currentPullRequestQuery.isLoading,
      gitStatus,
      gitStatusQuery,
      gitStatusQuery.isLoading,
      handleCommit,
      handleCreatePullRequest,
      handleMergePullRequest,
      handlePushBranch,
      handleShowChanges,
      isCommitting,
      isCreatingPullRequest,
      isMergingPullRequest,
      isPushingBranch,
    ],
  );
}
