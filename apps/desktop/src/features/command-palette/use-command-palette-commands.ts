import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Circle, File, Home, Settings } from "lucide-react";
import type { ProjectRecord, WorkspaceRecord } from "@lifecycle/contracts";
import { getWorkspaceDisplayName } from "@/features/workspaces/lib/workspace-display";
import { formatAppHotkeyLabel, isMacPlatform } from "@/app/app-hotkeys";
import type { CommandPaletteCommand } from "@/features/command-palette/types";

interface UseCommandPaletteCommandsOptions {
  onOpenExplorer?: () => void;
  projects: ProjectRecord[];
  workspacesByProjectId: Record<string, WorkspaceRecord[]>;
}

export function useCommandPaletteCommands(
  options: UseCommandPaletteCommandsOptions,
): CommandPaletteCommand[] {
  const { onOpenExplorer, projects, workspacesByProjectId } = options;
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const mac = isMacPlatform();

  return useMemo(() => {
    const projectsById = new Map(projects.map((project) => [project.id, project]));
    const workspaceCommands = Object.entries(workspacesByProjectId).flatMap(
      ([projectId, workspaces]) => {
        const project = projectsById.get(projectId);
        if (!project) {
          return [];
        }

        return workspaces.map((workspace) => {
          const displayName = getWorkspaceDisplayName(workspace);
          return {
            id: `ws:${workspace.id}`,
            category: "workspace",
            label: `${project.name} / ${displayName}`,
            keywords: ["workspace", project.name, displayName, workspace.source_ref],
            icon: Circle,
            onExecute: () =>
              void navigate(`/projects/${workspace.project_id}/workspaces/${workspace.id}`),
          } satisfies CommandPaletteCommand;
        });
      },
    );
    const actionCommands = workspaceId
      ? [
          ...(onOpenExplorer
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
            : []),
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
  }, [mac, navigate, onOpenExplorer, projects, workspaceId, workspacesByProjectId]);
}
