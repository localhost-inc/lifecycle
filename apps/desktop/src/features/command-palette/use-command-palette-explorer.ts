import { useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { File } from "lucide-react";
import { useParams } from "react-router-dom";
import { useWorkspaceClientRegistry } from "@lifecycle/workspace/client/react";
import {
  readWorkspaceExplorerUsage,
  readWorkspaceExplorerUsageVersion,
  scoreWorkspaceExplorerUsage,
  subscribeWorkspaceExplorerUsage,
  type WorkspaceExplorerUsageEntry,
} from "@/features/explorer/lib/workspace-explorer-usage";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import { workspaceSupportsFilesystemInteraction } from "@/features/workspaces/lib/workspace-capabilities";
import {
  normalizeWorkspaceFilePath,
  workspaceFileBasename,
  workspaceFileDirname,
} from "@/features/workspaces/lib/workspace-file-paths";
import { useWorkspaceOpenRequests } from "@/features/workspaces/state/workspace-open-requests";
import { createFileEditorOpenInput } from "@/features/workspaces/canvas/workspace-canvas-requests";
import type { CommandPaletteCommand } from "@/features/command-palette/types";
import { useWorkspacesByProject } from "@/store";

interface UseCommandPaletteExplorerResult {
  error: unknown;
  isAvailable: boolean;
  isLoading: boolean;
  items: CommandPaletteCommand[];
}

export function useCommandPaletteExplorer(): UseCommandPaletteExplorerResult {
  const { workspaceId } = useParams();
  const { openTab } = useWorkspaceOpenRequests();
  const workspacesByProject = useWorkspacesByProject();
  const currentWorkspace = useMemo(
    () =>
      workspaceId
        ? (Object.values(workspacesByProject)
            .flat()
            .find((workspace) => workspace.id === workspaceId) ?? null)
        : null,
    [workspaceId, workspacesByProject],
  );
  const isAvailable =
    currentWorkspace !== null && workspaceSupportsFilesystemInteraction(currentWorkspace);
  const workspaceClientRegistry = useWorkspaceClientRegistry();
  const workspaceClient = currentWorkspace
    ? workspaceClientRegistry.resolve(currentWorkspace.host)
    : workspaceClientRegistry.resolve("local");
  const explorerTreeQuery = useQuery({
    queryKey:
      isAvailable && currentWorkspace
        ? workspaceKeys.fileTree(currentWorkspace.id)
        : ["workspace-file-tree", "disabled"],
    queryFn: () => workspaceClient.listFiles(currentWorkspace!),
    enabled: isAvailable && currentWorkspace !== null,
  });
  const workspaceIdForFiles = currentWorkspace?.id ?? null;
  const usageVersion = useSyncExternalStore(
    subscribeWorkspaceExplorerUsage,
    readWorkspaceExplorerUsageVersion,
    () => 0,
  );
  const usageByPath = useMemo<Record<string, WorkspaceExplorerUsageEntry>>(
    () => (workspaceIdForFiles ? readWorkspaceExplorerUsage(workspaceIdForFiles) : {}),
    [workspaceIdForFiles, usageVersion],
  );

  const items = useMemo(() => {
    if (!currentWorkspace) {
      return [];
    }

    return (explorerTreeQuery.data ?? []).map((entry) => {
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
        onExecute: () => openTab(currentWorkspace.id, createFileEditorOpenInput(filePath)),
        priority: scoreWorkspaceExplorerUsage(usageByPath[filePath]),
      } satisfies CommandPaletteCommand;
    });
  }, [currentWorkspace, explorerTreeQuery.data, openTab, usageByPath]);

  return {
    error: explorerTreeQuery.error,
    isAvailable,
    isLoading: explorerTreeQuery.isLoading,
    items,
  };
}
