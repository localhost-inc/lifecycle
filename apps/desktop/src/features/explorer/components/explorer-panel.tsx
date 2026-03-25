import type { WorkspaceTarget } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { FolderOpen } from "lucide-react";
import { useEffect, useRef } from "react";
import { ExplorerTree } from "@/features/explorer/components/explorer-tree";
import { useWorkspaceFileTree } from "@/features/workspaces/hooks";
import { useClient } from "@/store";

interface ExplorerPanelProps {
  onOpenFile: (filePath: string) => void;
  workspaceId: string;
  workspaceTarget: WorkspaceTarget;
  worktreePath: string | null;
}

export function ExplorerPanel({
  onOpenFile,
  workspaceId,
  worktreePath,
}: ExplorerPanelProps) {
  const client = useClient();
  const supportsFiles = worktreePath !== null;
  const explorerTreeQuery = useWorkspaceFileTree(supportsFiles ? workspaceId : null);
  const refreshExplorerTreeRef = useRef(explorerTreeQuery.refetch);
  refreshExplorerTreeRef.current = explorerTreeQuery.refetch;

  useEffect(() => {
    if (!supportsFiles) {
      return;
    }

    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    void client
      .subscribeFileEvents(
        {
          workspaceId,
          worktreePath,
        },
        () => {
          void refreshExplorerTreeRef.current();
        },
      )
      .then((cleanup) => {
        if (disposed) {
          cleanup();
          return;
        }

        unsubscribe = cleanup;
      })
      .catch((error) => {
        console.error("Failed to subscribe to workspace file events:", workspaceId, error);
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [client, supportsFiles, workspaceId, worktreePath]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      {supportsFiles ? (
        <ExplorerTree
          activeFilePath=""
          entries={explorerTreeQuery.data}
          error={explorerTreeQuery.error}
          isLoading={explorerTreeQuery.isLoading}
          onOpenFile={onOpenFile}
        />
      ) : (
        <div className="px-2.5 py-4">
          <EmptyState
            description="Explorer is available when Lifecycle has a local worktree for this workspace."
            icon={<FolderOpen />}
            size="sm"
            title="Explorer unavailable"
          />
        </div>
      )}
    </section>
  );
}
