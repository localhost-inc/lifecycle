import { isTauri } from "@tauri-apps/api/core";
import type { LifecycleConfig } from "@lifecycle/contracts";
import { watch, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { useEffect } from "react";
import { useQueryClient } from "../../../query";
import { syncWorkspaceManifest } from "../../workspaces/api";
import { useWorkspacesByProject, workspaceKeys } from "../../workspaces/hooks";
import { readManifest } from "../api/projects";
import { useProjects, projectKeys } from "../hooks";
import { watchEventTouchesManifest } from "../lib/manifest-watch";

export function ProjectManifestWatcher() {
  const client = useQueryClient();
  const projectsQuery = useProjects();
  const workspacesByProjectQuery = useWorkspacesByProject();
  const projects = projectsQuery.data;
  const workspacesByProject = workspacesByProjectQuery.data;

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

                const manifestStatus = await readManifest(project.path);
                const config: LifecycleConfig | null =
                  manifestStatus.state === "valid" ? manifestStatus.result.config : null;
                const workspaces = workspacesByProject?.[project.id] ?? [];

                await Promise.all(
                  workspaces.map(async (workspace) => {
                    await syncWorkspaceManifest(workspace.id, config);
                    client.invalidate(workspaceKeys.detail(workspace.id));
                    client.invalidate(workspaceKeys.services(workspace.id));
                  }),
                );

                client.invalidate(workspaceKeys.byProject());
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
  }, [client, projects, workspacesByProject]);

  return null;
}
