import { isTauri } from "@tauri-apps/api/core";
import type { WorkspaceRecord } from "@lifecycle/contracts";
import { watch, type UnwatchFn } from "@tauri-apps/plugin-fs";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspacesByRepository } from "@/store";
import { workspaceKeys } from "@/features/workspaces/state/workspace-query-keys";
import { repositoryKeys, useRepositoryCatalog } from "@/features/repositories/hooks";
import { watchEventTouchesManifest } from "@/features/repositories/lib/manifest-watch";

export function RepositoryManifestWatcher() {
  const queryClient = useQueryClient();
  const repositoryCatalogQuery = useRepositoryCatalog();
  const workspacesByRepository = useWorkspacesByRepository();
  const repositories = repositoryCatalogQuery.data?.repositories;
  const workspaces = useMemo(
    () =>
      workspacesByRepository
        ? Object.values(workspacesByRepository)
            .flat()
            .filter(
              (workspace): workspace is WorkspaceRecord & { worktree_path: string } =>
                workspace.worktree_path !== null,
            )
        : null,
    [workspacesByRepository],
  );

  useEffect(() => {
    if (!isTauri() || !repositories || repositories.length === 0) {
      return;
    }

    let cancelled = false;
    const unwatchFns: UnwatchFn[] = [];

    void Promise.all(
      repositories.map(async (repository) => {
        try {
          const unwatch = await watch(
            repository.path,
            (event) => {
              if (!watchEventTouchesManifest(repository.path, event.paths)) {
                return;
              }

              void queryClient.invalidateQueries({
                queryKey: repositoryKeys.manifest(repository.id),
              });
              void queryClient.invalidateQueries({
                queryKey: repositoryKeys.catalog(),
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
          console.error("Failed to watch repository manifest:", repository.path, error);
        }
      }),
    );

    return () => {
      cancelled = true;
      for (const unwatch of unwatchFns) {
        unwatch();
      }
    };
  }, [queryClient, repositories]);

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
