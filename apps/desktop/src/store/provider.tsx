import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import { StoreClient } from "./client";
import { createSource } from "./source";

const StoreContext = createContext<StoreClient | null>(null);

export function StoreProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => new StoreClient(createSource()));

  useEffect(() => {
    void client.connect();
    return () => {
      client.dispose();
    };
  }, [client]);

  return <StoreContext.Provider value={client}>{children}</StoreContext.Provider>;
}

export function useStoreClient(): StoreClient {
  const client = useContext(StoreContext);
  if (!client) {
    throw new Error("StoreProvider is required");
  }
  return client;
}
