import type { GitLogEntry, WorkspaceMode } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { useEffect, useState } from "react";
import { useGitLog } from "../hooks";
import { HistoryTab } from "./history-tab";

export const GIT_HISTORY_PANEL_BODY_CLASS_NAME = "px-2.5 pb-4 pt-3";
export const GIT_HISTORY_PANEL_EMPTY_STATE_CLASS_NAME = "px-2.5 py-4";

interface GitHistoryPanelProps {
  onOpenCommitDiff: (entry: GitLogEntry) => void;
  workspaceId: string;
  workspaceMode: WorkspaceMode;
  worktreePath: string | null;
}

export function GitHistoryPanel({
  onOpenCommitDiff,
  workspaceId,
  workspaceMode,
  worktreePath,
}: GitHistoryPanelProps) {
  const [documentVisible, setDocumentVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const supportsHistory = workspaceMode === "local" && worktreePath !== null;

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

  const gitLogQuery = useGitLog(supportsHistory ? workspaceId : null, 50, {
    polling: documentVisible,
  });

  return (
    <section className="flex min-h-0 h-full flex-col">
      <div className="px-2.5 py-3">
        <span className="app-panel-title">History</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={`flex min-h-0 flex-1 flex-col ${GIT_HISTORY_PANEL_BODY_CLASS_NAME}`}>
          {supportsHistory ? (
            <HistoryTab
              entries={gitLogQuery.data ?? []}
              error={gitLogQuery.error}
              isLoading={gitLogQuery.isLoading}
              onOpenCommit={onOpenCommitDiff}
            />
          ) : (
            <div className={GIT_HISTORY_PANEL_EMPTY_STATE_CLASS_NAME}>
              <EmptyState
                description="Workspace commit history will use the cloud provider once cloud Git state exists."
                size="sm"
                title="History unavailable"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
