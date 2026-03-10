import { isTauri } from "@tauri-apps/api/core";
import { watch, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { useEffect } from "react";
import { useQueryClient } from "../../../query";
import { useProjects, projectKeys } from "../hooks";
import { watchEventTouchesManifest } from "../lib/manifest-watch";

export function ProjectManifestWatcher() {
  const client = useQueryClient();
  const projectsQuery = useProjects();
  const projects = projectsQuery.data;

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

              client.invalidate(projectKeys.manifest(project.id));
              client.invalidate(projectKeys.catalog());
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

  return null;
}
