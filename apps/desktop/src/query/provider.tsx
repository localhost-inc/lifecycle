import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { subscribeToLifecycleEvents } from "@/features/events";
import { QueryClient } from "@/query/client";
import {
  invalidateQueriesForLifecycleEvent,
  QUERY_INVALIDATION_EVENT_KINDS,
} from "@/query/invalidation";
import { createQuerySource } from "@/query/source";

const QueryClientContext = createContext<QueryClient | null>(null);

export function QueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient(createQuerySource()));

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void subscribeToLifecycleEvents(QUERY_INVALIDATION_EVENT_KINDS, (event) => {
      invalidateQueriesForLifecycleEvent(client, event);
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
      client.dispose();
    };
  }, [client]);

  return <QueryClientContext.Provider value={client}>{children}</QueryClientContext.Provider>;
}

export function useQueryClient(): QueryClient {
  const client = useContext(QueryClientContext);
  if (!client) {
    throw new Error("QueryProvider is required");
  }
  return client;
}
