import type { GitDiffScope, GitLogEntry, WorkspaceMode } from "@lifecycle/contracts";
import { Tabs, TabsList, TabsTrigger, cn } from "@lifecycle/ui";
import { useState } from "react";
import { useGitLog, useGitStatus } from "../hooks";
import { ChangesTab } from "./changes-tab";
import { HistoryTab } from "./history-tab";

const sectionHeader =
  "text-[11px] uppercase tracking-[0.14em] text-[var(--muted-foreground)] font-medium";

interface VersionControlPanelProps {
  onOpenDiff: (filePath: string, scope: GitDiffScope) => void;
  onOpenCommitDiff: (entry: GitLogEntry) => void;
  workspaceId: string;
  workspaceMode: WorkspaceMode;
  worktreePath: string | null;
}

export const VERSION_CONTROL_PANEL_HEADER_CLASS_NAME = "px-2.5 py-3";
export const VERSION_CONTROL_PANEL_BODY_CLASS_NAME = "px-2.5 pb-4 pt-1";
export const VERSION_CONTROL_PANEL_EMPTY_STATE_CLASS_NAME = "px-2.5 py-4";

export function VersionControlPanel({
  onOpenDiff,
  onOpenCommitDiff,
  workspaceId,
  workspaceMode,
  worktreePath,
}: VersionControlPanelProps) {
  const [activeTab, setActiveTab] = useState<"changes" | "history">("changes");
  const supportsVersionControl = workspaceMode === "local" && worktreePath !== null;
  const gitStatusQuery = useGitStatus(supportsVersionControl ? workspaceId : null);
  const gitLogQuery = useGitLog(supportsVersionControl ? workspaceId : null, 50);

  if (!supportsVersionControl) {
    return (
      <section className="flex min-h-0 h-full flex-col">
        <div className={VERSION_CONTROL_PANEL_EMPTY_STATE_CLASS_NAME}>
          <span className={sectionHeader}>Version Control</span>
          <p className="mt-3 text-xs text-[var(--muted-foreground)]">
            Cloud workspace git state will arrive with the cloud provider.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 h-full flex-col">
      <div className={VERSION_CONTROL_PANEL_HEADER_CLASS_NAME}>
        <Tabs
          onValueChange={(value) => setActiveTab(value as "changes" | "history")}
          value={activeTab}
        >
          <TabsList className="gap-1 border-0 bg-transparent p-0">
            <TabsTrigger value="changes">Changes</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className={cn("flex min-h-0 flex-1 flex-col", VERSION_CONTROL_PANEL_BODY_CLASS_NAME)}>
          {activeTab === "changes" ? (
            <ChangesTab
              error={gitStatusQuery.error}
              gitStatus={gitStatusQuery.data ?? null}
              isLoading={gitStatusQuery.isLoading}
              onOpenDiff={onOpenDiff}
              refresh={gitStatusQuery.refresh}
              workspaceId={workspaceId}
            />
          ) : (
            <HistoryTab
              entries={gitLogQuery.data ?? []}
              error={gitLogQuery.error}
              isLoading={gitLogQuery.isLoading}
              onOpenCommit={onOpenCommitDiff}
            />
          )}
        </div>
      </div>
    </section>
  );
}
