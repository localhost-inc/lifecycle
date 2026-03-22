import { useEffect, useState, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LifecycleEventKind } from "@lifecycle/contracts";
import { subscribeToLifecycleEvents } from "@/features/events";

const GIT_INVALIDATION_KINDS: LifecycleEventKind[] = [
  "git.status_changed",
  "git.head_changed",
  "git.log_changed",
];

const FILE_INVALIDATION_KINDS: LifecycleEventKind[] = ["workspace.file_changed"];

const SERVICE_LOG_KINDS: LifecycleEventKind[] = ["service.log_line"];

const ACTIVITY_KINDS: LifecycleEventKind[] = [
  "workspace.status_changed",
  "workspace.renamed",
  "workspace.deleted",
  "terminal.created",
  "terminal.updated",
  "terminal.status_changed",
  "terminal.harness_turn_started",
  "terminal.harness_turn_completed",
  "terminal.harness_prompt_submitted",
  "service.status_changed",
];

const ALL_INVALIDATION_KINDS: LifecycleEventKind[] = [
  ...GIT_INVALIDATION_KINDS,
  ...FILE_INVALIDATION_KINDS,
  ...SERVICE_LOG_KINDS,
  ...ACTIVITY_KINDS,
];

// De-duplicate in case of overlap
const UNIQUE_KINDS = [...new Set(ALL_INVALIDATION_KINDS)];

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

function subscribeToInvalidations(queryClient: QueryClient): () => void {
  let disposed = false;
  let unlisten: (() => void) | null = null;

  void subscribeToLifecycleEvents(UNIQUE_KINDS, (event) => {
    switch (event.kind) {
      case "git.status_changed":
        void queryClient.invalidateQueries({
          queryKey: ["workspace-git-status"],
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: ["workspace-git-pull-requests"],
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: ["workspace-git-current-pull-request"],
          exact: false,
        });
        break;

      case "git.head_changed":
        void queryClient.invalidateQueries({
          queryKey: ["workspace-git-status"],
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: ["workspace-git-log"],
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: ["workspace-git-pull-requests"],
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: ["workspace-git-current-pull-request"],
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: ["workspace-git-pull-request"],
          exact: false,
        });
        break;

      case "git.log_changed":
        void queryClient.invalidateQueries({
          queryKey: ["workspace-git-log"],
          exact: false,
        });
        break;

      case "workspace.file_changed":
        void queryClient.invalidateQueries({
          queryKey: ["workspace-file-tree", event.workspace_id],
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: ["workspace-file", event.workspace_id],
          exact: false,
        });
        break;

      case "service.log_line":
        void queryClient.invalidateQueries({
          queryKey: ["workspace-service-logs"],
          exact: false,
        });
        break;

      case "workspace.status_changed":
      case "workspace.renamed":
      case "workspace.deleted":
      case "terminal.created":
      case "terminal.updated":
      case "terminal.status_changed":
      case "terminal.harness_turn_started":
      case "terminal.harness_turn_completed":
      case "terminal.harness_prompt_submitted":
      case "service.status_changed":
        void queryClient.invalidateQueries({
          queryKey: ["workspace-activity"],
          exact: false,
        });
        break;
    }
  }).then((cleanup) => {
    if (disposed) {
      cleanup();
      return;
    }
    unlisten = cleanup;
  });

  return () => {
    disposed = true;
    unlisten?.();
  };
}

export function ReactQueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    return subscribeToInvalidations(queryClient);
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
