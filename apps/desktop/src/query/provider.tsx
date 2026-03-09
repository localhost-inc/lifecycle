import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { subscribeToLifecycleEvents } from "../features/events";
import { QueryClient } from "./client";
import { createQuerySource } from "./source";

const QueryClientContext = createContext<QueryClient | null>(null);

export function QueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(
    () => new QueryClient(createQuerySource(), subscribeToLifecycleEvents),
  );

  useEffect(() => {
    return () => {
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
