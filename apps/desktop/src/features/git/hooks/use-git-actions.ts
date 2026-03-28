import type { GitPullRequestSummary } from "@lifecycle/contracts";
import { useWorkspaceClient } from "@lifecycle/workspace/client/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentGitPullRequest, useGitLog, useGitStatus } from "@/features/git/hooks";
import { useWorkspace } from "@/store";

export interface UseGitActionsOptions {
  onCommitComplete: () => void;
  onOpenPullRequest: (pullRequest: GitPullRequestSummary) => void;
  workspaceId: string;
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
}: UseGitActionsOptions): UseGitActionsResult {
  const workspace = useWorkspace(workspaceId);
  const client = useWorkspaceClient();
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
    workspace !== undefined &&
    (workspace.host === "local" || workspace.host === "docker") &&
    workspace.worktree_path !== null;

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
  const gitLogQuery = useGitLog(supportsChanges ? workspaceId : null, 50, {
    polling: false,
  });
  const currentPullRequestQuery = useCurrentGitPullRequest(workspaceId, {
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
      if (!client || !workspace) {
        throw new Error("Workspace host client is unavailable.");
      }
      await client.pushGit(workspace);
      await refreshPullRequestState();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPushingBranch(false);
    }
  }, [refreshPullRequestState, client, workspace]);

  const handleCommit = useCallback(
    async (message: string, pushAfterCommit: boolean): Promise<void> => {
      let committed = false;
      setActionError(null);
      setIsCommitting(true);

      try {
        if (!client || !workspace) {
          throw new Error("Workspace client is unavailable.");
        }
        await client.commitGit(workspace, message);
        committed = true;

        if (pushAfterCommit) {
          setIsPushingBranch(true);
          try {
            await client.pushGit(workspace);
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
    [onCommitComplete, refreshPullRequestState, client, workspace],
  );

  const handleCreatePullRequest = useCallback(async (): Promise<void> => {
    setActionError(null);
    setIsCreatingPullRequest(true);
    try {
      if (!client || !workspace) {
        throw new Error("Workspace host client is unavailable.");
      }
      const pullRequest = await client.createGitPullRequest(workspace);
      await refreshPullRequestState();
      onOpenPullRequest(pullRequest);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingPullRequest(false);
    }
  }, [onOpenPullRequest, refreshPullRequestState, client, workspace]);

  const handleMergePullRequest = useCallback(
    async (pullRequestNumber: number): Promise<void> => {
      setActionError(null);
      setIsMergingPullRequest(true);
      try {
        if (!client || !workspace) {
          throw new Error("Workspace client is unavailable.");
        }
        const pullRequest = await client.mergeGitPullRequest(workspace, pullRequestNumber);
        await refreshPullRequestState();
        onOpenPullRequest(pullRequest);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsMergingPullRequest(false);
      }
    },
    [onOpenPullRequest, refreshPullRequestState, client, workspace],
  );

  const handleShowChanges = useCallback(async (): Promise<void> => {
    if (!client || !workspace) {
      return;
    }
    const unstaged = (gitStatus?.files ?? []).filter((f) => f.unstaged);
    if (unstaged.length > 0) {
      await client.stageGitFiles(
        workspace,
        unstaged.map((f) => f.path),
      );
      await refreshGitStatus();
    }
  }, [gitStatus?.files, refreshGitStatus, client, workspace]);

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
