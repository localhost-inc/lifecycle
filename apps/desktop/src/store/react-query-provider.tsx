import { useEffect, useState, type PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { LifecycleEventKind } from "@lifecycle/contracts";
import { subscribeToLifecycleEvents } from "@/features/events";

const GIT_INVALIDATION_KINDS: LifecycleEventKind[] = [
  "git.status.changed",
  "git.head.changed",
  "git.log.changed",
];

const FILE_INVALIDATION_KINDS: LifecycleEventKind[] = ["workspace.file.changed"];

const SERVICE_LOG_KINDS: LifecycleEventKind[] = ["service.log.line"];

const ACTIVITY_KINDS: LifecycleEventKind[] = [
  "workspace.status.changed",
  "workspace.renamed",
  "workspace.archived",
  "service.status.changed",
];

const ALL_INVALIDATION_KINDS: LifecycleEventKind[] = [
  ...GIT_INVALIDATION_KINDS,
  ...FILE_INVALIDATION_KINDS,
  ...SERVICE_LOG_KINDS,
  ...ACTIVITY_KINDS,
];

// De-duplicate in case of overlap
const UNIQUE_KINDS = [...new Set(ALL_INVALIDATION_KINDS)];

interface ReactQueryProviderHotState {
  queryClient: QueryClient;
}

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
      case "git.status.changed":
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

      case "git.head.changed":
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

      case "git.log.changed":
        void queryClient.invalidateQueries({
          queryKey: ["workspace-git-log"],
          exact: false,
        });
        break;

      case "workspace.file.changed":
        void queryClient.invalidateQueries({
          queryKey: ["workspace-file-tree", event.workspaceId],
          exact: false,
        });
        void queryClient.invalidateQueries({
          queryKey: ["workspace-file", event.workspaceId],
          exact: false,
        });
        break;

      case "service.log.line":
        void queryClient.invalidateQueries({
          queryKey: ["workspace-service-logs"],
          exact: false,
        });
        break;

      case "workspace.status.changed":
      case "workspace.renamed":
      case "workspace.archived":
      case "service.status.changed":
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
  const hotState = import.meta.hot?.data as ReactQueryProviderHotState | undefined;
  const [queryClient] = useState(() => hotState?.queryClient ?? createQueryClient());

  if (import.meta.hot) {
    import.meta.hot.data.queryClient = queryClient;
  }

  useEffect(() => {
    return subscribeToInvalidations(queryClient);
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
