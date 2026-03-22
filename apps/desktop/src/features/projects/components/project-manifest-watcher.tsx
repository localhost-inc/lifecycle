import { isTauri } from "@tauri-apps/api/core";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { watch, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspacesByProject } from "@/store";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import { projectKeys, useProjectCatalog } from "@/features/projects/hooks";
import { watchEventTouchesManifest } from "@/features/projects/lib/manifest-watch";

export function ProjectManifestWatcher() {
  const queryClient = useQueryClient();
  const projectCatalogQuery = useProjectCatalog();
  const workspacesByProject = useWorkspacesByProject();
  const projects = projectCatalogQuery.data?.projects;
  const workspaces = useMemo(
    () =>
      workspacesByProject
        ? Object.values(workspacesByProject)
            .flat()
            .filter(
              (workspace): workspace is WorkspaceRecord & { worktree_path: string } =>
                workspace.worktree_path !== null,
            )
        : null,
    [workspacesByProject],
  );

  useEffect(() => {
    if (!isTauri() || !projects || projects.length === 0) {
      return;
    }

    let cancelled = false;
    const unwatchFns: UnwatchFn[] = [];

    void Promise.all(
      projects.map(async (project) => {
        try {
          const unwatch = await watch(
            project.path,
            (event) => {
              if (!watchEventTouchesManifest(project.path, event.paths)) {
                return;
              }

              void queryClient.invalidateQueries({
                queryKey: projectKeys.manifest(project.id),
              });
              void queryClient.invalidateQueries({
                queryKey: projectKeys.catalog(),
              });
            },
            { delayMs: 150, recursive: false },
          );

          if (cancelled) {
            unwatch();
            return;
          }

          unwatchFns.push(unwatch);
        } catch (error) {
          console.error("Failed to watch project manifest:", project.path, error);
        }
      }),
    );

    return () => {
      cancelled = true;
      for (const unwatch of unwatchFns) {
        unwatch();
      }
    };
  }, [queryClient, projects]);

  useEffect(() => {
    if (!isTauri() || !workspaces || workspaces.length === 0) {
      return;
    }

    let cancelled = false;
    const unwatchFns: UnwatchFn[] = [];

    void Promise.all(
      workspaces.map(async (workspace) => {
        try {
          const unwatch = await watch(
            workspace.worktree_path,
            (event) => {
              if (!watchEventTouchesManifest(workspace.worktree_path, event.paths)) {
                return;
              }

              void queryClient.invalidateQueries({
                queryKey: workspaceKeys.manifest(workspace.id),
              });
            },
            { delayMs: 150, recursive: false },
          );

          if (cancelled) {
            unwatch();
            return;
          }

          unwatchFns.push(unwatch);
        } catch (error) {
          console.error("Failed to watch workspace manifest:", workspace.worktree_path, error);
        }
      }),
    );

    return () => {
      cancelled = true;
      for (const unwatch of unwatchFns) {
        unwatch();
      }
    };
  }, [queryClient, workspaces]);

  return null;
}
