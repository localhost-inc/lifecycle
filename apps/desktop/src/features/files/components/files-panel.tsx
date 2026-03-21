import type { WorkspaceTarget } from "@lifecycle/contracts";
import { EmptyState } from "@lifecycle/ui";
import { FolderOpen } from "lucide-react";
import { useEffect, useRef } from "react";
import { FileTree } from "@/features/files/components/file-tree";
import { useWorkspaceFileTree } from "@/features/workspaces/hooks";
import { getWorkspaceClient } from "@/lib/workspace";

interface FilesPanelProps {
  onOpenFile: (filePath: string) => void;
  workspaceId: string;
  workspaceTarget: WorkspaceTarget;
  worktreePath: string | null;
}

export function FilesPanel({
  onOpenFile,
  workspaceId,
  worktreePath,
}: FilesPanelProps) {
  const supportsFiles = worktreePath !== null;
  const fileTreeQuery = useWorkspaceFileTree(supportsFiles ? workspaceId : null);
  const refreshFileTreeRef = useRef(fileTreeQuery.refresh);
  refreshFileTreeRef.current = fileTreeQuery.refresh;

  useEffect(() => {
    if (!supportsFiles) {
      return;
    }

    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    void getWorkspaceClient()
      .subscribeFileEvents(
        {
          workspaceId,
          worktreePath,
        },
        () => {
          void refreshFileTreeRef.current();
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
  }, [supportsFiles, workspaceId, worktreePath]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      {supportsFiles ? (
        <FileTree
          activeFilePath=""
          entries={fileTreeQuery.data}
          error={fileTreeQuery.error}
          isLoading={fileTreeQuery.isLoading}
          onOpenFile={onOpenFile}
        />
      ) : (
        <div className="px-2.5 py-4">
          <EmptyState
            description="Workspace files are available when Lifecycle has a local worktree for this workspace."
            icon={<FolderOpen />}
            size="sm"
            title="Files unavailable"
          />
        </div>
      )}
    </section>
  );
}
