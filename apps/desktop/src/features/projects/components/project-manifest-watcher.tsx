import { isTauri } from "@tauri-apps/api/core";
import type { LifecycleConfig, WorkspaceRecord } from "@lifecycle/contracts";
import { watch, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "../../../query";
import { syncWorkspaceManifest } from "../../workspaces/api";
import { useWorkspacesByProject, workspaceKeys } from "../../workspaces/hooks";
import { readManifest, type ManifestStatus } from "../api/projects";
import { useProjects, projectKeys } from "../hooks";
import { watchEventTouchesManifest } from "../lib/manifest-watch";

function configFromManifestStatus(manifestStatus: ManifestStatus): LifecycleConfig | null {
  return manifestStatus.state === "valid" ? manifestStatus.result.config : null;
}

export function ProjectManifestWatcher() {
  const client = useQueryClient();
  const projectsQuery = useProjects();
  const workspacesByProjectQuery = useWorkspacesByProject();
  const projects = projectsQuery.data;
  const workspacesByProject = workspacesByProjectQuery.data;
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

              void (async () => {
                client.invalidate(projectKeys.manifest(project.id));
                client.invalidate(projectKeys.catalog());
              })();
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
  }, [client, projects]);

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

              void (async () => {
                client.invalidate(workspaceKeys.manifest(workspace.id));

                const manifestStatus = await readManifest(workspace.worktree_path);
                await syncWorkspaceManifest(workspace.id, configFromManifestStatus(manifestStatus));
              })();
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
  }, [client, workspaces]);

  return null;
}
