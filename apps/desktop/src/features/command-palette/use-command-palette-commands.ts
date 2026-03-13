import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Circle, File, GitFork, Home, Layers, Settings } from "lucide-react";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { useProjects } from "../projects/hooks";
import { useWorkspacesByProject } from "../workspaces/hooks";
import { getWorkspaceDisplayName } from "../workspaces/lib/workspace-display";
import { formatAppHotkeyLabel, isMacPlatform } from "../../app/app-hotkeys";
import type { CommandPaletteCommand } from "./types";

function workspaceIcon(workspace: WorkspaceRecord): typeof Circle {
  if (workspace.status === "active") {
    return Layers;
  }

  return Circle;
}

interface UseCommandPaletteCommandsOptions {
  onForkWorkspace?: () => void;
  onOpenFiles?: () => void;
}

export function useCommandPaletteCommands(
  options: UseCommandPaletteCommandsOptions = {},
): CommandPaletteCommand[] {
  const { onForkWorkspace, onOpenFiles } = options;
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const projectsQuery = useProjects();
  const workspacesByProjectQuery = useWorkspacesByProject();
  const projects = projectsQuery.data ?? [];
  const workspacesByProjectId = workspacesByProjectQuery.data ?? {};
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
            icon: workspaceIcon(workspace),
            onExecute: () => void navigate(`/workspaces/${workspace.id}`),
          } satisfies CommandPaletteCommand;
        });
      },
    );
    const actionCommands = workspaceId
      ? [
          ...(onOpenFiles
            ? [
                {
                  id: "action:open-file",
                  category: "action",
                  label: "Open File...",
                  keywords: ["file", "path", "picker", "search"],
                  icon: File,
                  shortcut: formatAppHotkeyLabel("open-file-picker", mac),
                  onExecute: onOpenFiles,
                } satisfies CommandPaletteCommand,
              ]
            : []),
          ...(onForkWorkspace
            ? [
                {
                  id: "action:fork",
                  category: "action",
                  label: "Fork Workspace",
                  keywords: ["branch", "copy", "duplicate"],
                  icon: GitFork,
                  onExecute: onForkWorkspace,
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
  }, [mac, navigate, onForkWorkspace, onOpenFiles, projects, workspaceId, workspacesByProjectId]);
}
