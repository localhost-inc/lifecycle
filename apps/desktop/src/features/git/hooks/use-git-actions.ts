import type { GitPullRequestSummary, WorkspaceHost } from "@lifecycle/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  commitGit,
  createGitPullRequest,
  mergeGitPullRequest,
  pushGit,
  stageGitFiles,
} from "@/features/git/api";
import { useCurrentGitPullRequest, useGitLog, useGitStatus } from "@/features/git/hooks";
import { useOptionalWorkspaceHostClient } from "@lifecycle/workspace/client/react";

export interface UseGitActionsOptions {
  onCommitComplete: () => void;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  workspaceId: string;
  workspaceHost: WorkspaceHost | null;
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
  workspaceHost,
  worktreePath,
}: UseGitActionsOptions): UseGitActionsResult {
  const client = useOptionalWorkspaceHostClient(workspaceHost);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isCreatingPullRequest, setIsCreatingPullRequest] = useState(false);
  const [isMergingPullRequest, setIsMergingPullRequest] = useState(false);
  const [isPushingBranch, setIsPushingBranch] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const supportsChanges =
    client !== null &&
    (workspaceHost === "local" || workspaceHost === "docker") &&
    worktreePath !== null;

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

  const gitStatusQuery = useGitStatus(supportsChanges ? workspaceId : null, workspaceHost, {
    polling: documentVisible,
  });
  const gitLogQuery = useGitLog(supportsChanges ? workspaceId : null, workspaceHost, 50, {
    polling: false,
  });
  const currentPullRequestQuery = useCurrentGitPullRequest(workspaceId, workspaceHost, {
    polling: documentVisible,
  });
  const gitStatus = gitStatusQuery.data;
  const refreshGitStatus = gitStatusQuery.refetch;
  const refreshGitLog = gitLogQuery.refetch;
  const branchPullRequest = currentPullRequestQuery.data ?? null;
  const refreshCurrentPullRequest = currentPullRequestQuery.refetch;

  const refreshPullRequestState = useCallback(async (): Promise<void> => {
    await Promise.all([refreshGitStatus(), refreshGitLog(), refreshCurrentPullRequest()]);
  }, [refreshCurrentPullRequest, refreshGitLog, refreshGitStatus]);

  const handlePushBranch = useCallback(async (): Promise<void> => {
    setActionError(null);
    setIsPushingBranch(true);
    try {
      if (!client) {
        throw new Error("Workspace host client is unavailable.");
      }
      await pushGit(client, workspaceId);
      await refreshPullRequestState();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPushingBranch(false);
    }
  }, [refreshPullRequestState, client, workspaceId]);

  const handleCommit = useCallback(
    async (message: string, pushAfterCommit: boolean): Promise<void> => {
      let committed = false;
      setActionError(null);
      setIsCommitting(true);

      try {
        if (!client) {
          throw new Error("Workspace host client is unavailable.");
        }
        await commitGit(client, workspaceId, message);
        committed = true;

        if (pushAfterCommit) {
          setIsPushingBranch(true);
          try {
            await pushGit(client, workspaceId);
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
    [onCommitComplete, refreshPullRequestState, client, workspaceId],
  );

  const handleCreatePullRequest = useCallback(async (): Promise<void> => {
    setActionError(null);
    setIsCreatingPullRequest(true);
    try {
      if (!client) {
        throw new Error("Workspace host client is unavailable.");
      }
      const pullRequest = await createGitPullRequest(client, workspaceId);
      await refreshPullRequestState();
      onOpenPullRequest(pullRequest);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingPullRequest(false);
    }
  }, [onOpenPullRequest, refreshPullRequestState, client, workspaceId]);

  const handleMergePullRequest = useCallback(
    async (pullRequestNumber: number): Promise<void> => {
      setActionError(null);
      setIsMergingPullRequest(true);
      try {
        if (!client) {
          throw new Error("Workspace host client is unavailable.");
        }
        const pullRequest = await mergeGitPullRequest(client, workspaceId, pullRequestNumber);
        await refreshPullRequestState();
        onOpenPullRequest(pullRequest);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsMergingPullRequest(false);
      }
    },
    [onOpenPullRequest, refreshPullRequestState, client, workspaceId],
  );

  const handleShowChanges = useCallback(async (): Promise<void> => {
    if (!client) {
      return;
    }
    const unstaged = (gitStatus?.files ?? []).filter((f) => f.unstaged);
    if (unstaged.length > 0) {
      await stageGitFiles(
        client,
        workspaceId,
        unstaged.map((f) => f.path),
      );
      await refreshGitStatus();
    }
  }, [gitStatus?.files, refreshGitStatus, client, workspaceId]);

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
