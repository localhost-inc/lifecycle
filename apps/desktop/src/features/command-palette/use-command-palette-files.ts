import { useMemo, useSyncExternalStore } from "react";
import { File } from "lucide-react";
import { useParams } from "react-router-dom";
import {
  readWorkspaceFileUsage,
  readWorkspaceFileUsageVersion,
  scoreWorkspaceFileUsage,
  subscribeWorkspaceFileUsage,
  type WorkspaceFileUsageEntry,
} from "@/features/files/lib/workspace-file-usage";
import { useWorkspaceFileTree, useWorkspacesByProject } from "@/features/workspaces/hooks";
import { workspaceSupportsFilesystemInteraction } from "@/features/workspaces/lib/workspace-capabilities";
import {
  normalizeWorkspaceFilePath,
  workspaceFileBasename,
  workspaceFileDirname,
} from "@/features/workspaces/lib/workspace-file-paths";
import { useWorkspaceOpenRequests } from "@/features/workspaces/state/workspace-open-requests";
import { createFileViewerOpenInput } from "@/features/workspaces/components/workspace-canvas-requests";
import type { CommandPaletteCommand } from "@/features/command-palette/types";

interface UseCommandPaletteFilesResult {
  error: unknown;
  isAvailable: boolean;
  isLoading: boolean;
  items: CommandPaletteCommand[];
}

export function useCommandPaletteFiles(): UseCommandPaletteFilesResult {
  const { workspaceId } = useParams();
  const { openDocument } = useWorkspaceOpenRequests();
  const workspacesByProjectQuery = useWorkspacesByProject();
  const currentWorkspace = useMemo(
    () =>
      workspaceId
        ? (Object.values(workspacesByProjectQuery.data ?? {})
            .flat()
            .find((workspace) => workspace.id === workspaceId) ?? null)
        : null,
    [workspaceId, workspacesByProjectQuery.data],
  );
  const isAvailable =
    currentWorkspace !== null && workspaceSupportsFilesystemInteraction(currentWorkspace);
  const fileTreeQuery = useWorkspaceFileTree(isAvailable ? currentWorkspace.id : null);
  const workspaceIdForFiles = currentWorkspace?.id ?? null;
  const usageVersion = useSyncExternalStore(
    subscribeWorkspaceFileUsage,
    readWorkspaceFileUsageVersion,
    () => 0,
  );
  const usageByPath = useMemo<Record<string, WorkspaceFileUsageEntry>>(
    () => (workspaceIdForFiles ? readWorkspaceFileUsage(workspaceIdForFiles) : {}),
    [workspaceIdForFiles, usageVersion],
  );

  const items = useMemo(() => {
    if (!currentWorkspace) {
      return [];
    }

    return (fileTreeQuery.data ?? []).map((entry) => {
      const filePath = normalizeWorkspaceFilePath(entry.file_path);
      const label = workspaceFileBasename(filePath);
      const dirname = workspaceFileDirname(filePath).replace(/\/$/, "");

      return {
        id: `file:${filePath}`,
        category: "workspace",
        description: dirname || filePath,
        icon: File,
        keywords: [filePath, label, dirname, entry.extension ?? ""].filter(Boolean),
        label,
        onExecute: () => openDocument(currentWorkspace.id, createFileViewerOpenInput(filePath)),
        priority: scoreWorkspaceFileUsage(usageByPath[filePath]),
      } satisfies CommandPaletteCommand;
    });
  }, [currentWorkspace, fileTreeQuery.data, openDocument, usageByPath]);

  return {
    error: fileTreeQuery.error,
    isAvailable,
    isLoading: fileTreeQuery.isLoading,
    items,
  };
}
