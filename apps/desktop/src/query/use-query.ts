import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { QueryDescriptor } from "./client";
import { useQueryClient } from "./provider";

export interface QueryResult<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  refresh: () => Promise<void>;
  status: "idle" | "loading" | "ready" | "error";
}

interface UseQueryOptions<T> {
  disabledData: T;
}

export function useQuery<T>(
  descriptor: QueryDescriptor<T> | null,
  options: UseQueryOptions<T>,
): QueryResult<T> {
  const client = useQueryClient();
  const { disabledData } = options;
  const disabledSnapshot = useMemo(
    () => ({
      data: disabledData,
      error: null,
      status: "ready" as const,
    }),
    [disabledData],
  );

  const subscribe = useCallback(
    (listener: () => void) => (descriptor ? client.subscribe(descriptor, listener) : () => {}),
    [client, descriptor],
  );
  const getSnapshot = useCallback(
    () => (descriptor ? client.getSnapshot(descriptor) : disabledSnapshot),
    [client, descriptor, disabledSnapshot],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refresh = useCallback(
    () => (descriptor ? client.refetch(descriptor) : Promise.resolve()),
    [client, descriptor],
  );

  return useMemo(
    () => ({
      data: snapshot.data,
      error: snapshot.error,
      isLoading: snapshot.status === "idle" || snapshot.status === "loading",
      refresh,
      status: snapshot.status,
    }),
    [refresh, snapshot.data, snapshot.error, snapshot.status],
  );
}
