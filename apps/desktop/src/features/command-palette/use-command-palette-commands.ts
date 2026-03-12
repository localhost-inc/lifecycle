import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Circle, GitFork, Home, Layers, Settings } from "lucide-react";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { useProjects } from "../projects/hooks";
import { useWorkspacesByProject } from "../workspaces/hooks";
import { getWorkspaceDisplayName } from "../workspaces/lib/workspace-display";
import { isMacPlatform } from "../../app/app-hotkeys";
import type { CommandPaletteCommand } from "./types";

function workspaceIcon(workspace: WorkspaceRecord): typeof Circle {
  if (workspace.status === "active") {
    return Layers;
  }

  return Circle;
}

export function useCommandPaletteCommands(): CommandPaletteCommand[] {
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const projectsQuery = useProjects();
  const workspacesByProjectQuery = useWorkspacesByProject();
  const projects = projectsQuery.data ?? [];
  const workspacesByProjectId = workspacesByProjectQuery.data ?? {};
  const mac = isMacPlatform();

  return useMemo(() => {
    const commands: CommandPaletteCommand[] = [];

    commands.push({
      id: "nav:dashboard",
      category: "navigation",
      label: "Go to Dashboard",
      keywords: ["home", "overview"],
      icon: Home,
      onExecute: () => void navigate("/"),
    });

    commands.push({
      id: "nav:settings",
      category: "navigation",
      label: "Open Settings",
      keywords: ["preferences", "config"],
      icon: Settings,
      shortcut: mac ? "Cmd+," : "Ctrl+,",
      onExecute: () => void navigate("/settings"),
    });

    const projectsById = new Map(projects.map((project) => [project.id, project]));

    for (const [projectId, workspaces] of Object.entries(workspacesByProjectId)) {
      const project = projectsById.get(projectId);
      if (!project) continue;

      for (const workspace of workspaces) {
        const displayName = getWorkspaceDisplayName(workspace);
        commands.push({
          id: `ws:${workspace.id}`,
          category: "workspace",
          label: `${project.name} / ${displayName}`,
          keywords: ["workspace", project.name, displayName, workspace.source_ref],
          icon: workspaceIcon(workspace),
          onExecute: () => void navigate(`/workspaces/${workspace.id}`),
        });
      }
    }

    if (workspaceId) {
      commands.push({
        id: "action:fork",
        category: "action",
        label: "Fork Workspace",
        keywords: ["branch", "copy", "duplicate"],
        icon: GitFork,
        onExecute: () => {
          document.dispatchEvent(new CustomEvent("command-palette:fork-workspace"));
        },
      });
    }

    return commands;
  }, [mac, navigate, projects, workspaceId, workspacesByProjectId]);
}
