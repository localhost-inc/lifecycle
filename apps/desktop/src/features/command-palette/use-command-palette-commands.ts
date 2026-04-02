import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Circle, File, Home, Settings } from "lucide-react";
import type { RepositoryRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { getWorkspaceDisplayName } from "@/features/workspaces/lib/workspace-display";
import { formatAppHotkeyLabel, isMacPlatform } from "@/app/app-hotkeys";
import type { CommandPaletteCommand } from "@/features/command-palette/types";

interface UseCommandPaletteCommandsOptions {
  onOpenExplorer?: () => void;
  repositories: RepositoryRecord[];
  workspacesByRepositoryId: Record<string, WorkspaceRecord[]>;
}

export function useCommandPaletteCommands(
  options: UseCommandPaletteCommandsOptions,
): CommandPaletteCommand[] {
  const { onOpenExplorer, repositories, workspacesByRepositoryId } = options;
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const mac = isMacPlatform();

  return useMemo(() => {
    const repositoriesById = new Map(
      repositories.map((repository) => [repository.id, repository]),
    );
    const workspaceCommands = Object.entries(workspacesByRepositoryId).flatMap(
      ([repositoryId, workspaces]) => {
        const repository = repositoriesById.get(repositoryId);
        if (!repository) {
          return [];
        }

        return workspaces.map((workspace) => {
          const displayName = getWorkspaceDisplayName(workspace);
          return {
            id: `ws:${workspace.id}`,
            category: "workspace",
            label: `${repository.name} / ${displayName}`,
            keywords: ["workspace", repository.name, displayName, workspace.source_ref],
            icon: Circle,
            onExecute: () =>
              void navigate(`/repositories/${workspace.repository_id}/workspaces/${workspace.id}`),
          } satisfies CommandPaletteCommand;
        });
      },
    );
    const actionCommands =
      workspaceId && onOpenExplorer
        ? [
            {
              id: "action:open-explorer",
              category: "action",
              label: "Open Explorer...",
              keywords: ["file", "path", "picker", "search"],
              icon: File,
              shortcut: formatAppHotkeyLabel("open-explorer", mac),
              onExecute: onOpenExplorer,
            } satisfies CommandPaletteCommand,
          ]
        : [];

    return [
      {
        id: "nav:dashboard",
        category: "navigation",
        label: "Go to Dashboard",
        keywords: ["home", "overview"],
        icon: Home,
        onExecute: () => void navigate("/"),
      },
      {
        id: "nav:settings",
        category: "navigation",
        label: "Open Settings",
        keywords: ["preferences", "config"],
        icon: Settings,
        shortcut: formatAppHotkeyLabel("open-settings", mac),
        onExecute: () => void navigate("/settings"),
      },
      ...workspaceCommands,
      ...actionCommands,
    ];
  }, [mac, navigate, onOpenExplorer, repositories, workspaceId, workspacesByRepositoryId]);
}
