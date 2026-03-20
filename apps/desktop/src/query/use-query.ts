import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { QueryDescriptor, QuerySnapshot, QueryStatus } from "@/query/client";
import { useQueryClient } from "@/query/provider";

export interface QueryResult<T> {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  refresh: () => Promise<void>;
  status: QueryStatus;
}

export function useQuery<TData>(
  descriptor: QueryDescriptor<TData> | null,
): QueryResult<TData> {
  const client = useQueryClient();
  const disabledSnapshot = useMemo(
    () => ({
      data: undefined,
      error: null,
      status: "disabled" as const,
    }),
    [],
  );
  const subscribe = useCallback(
    (listener: () => void) => (descriptor ? client.subscribe(descriptor, listener) : () => {}),
    [client, descriptor],
  );
  const getSnapshot = useCallback(
    (): QuerySnapshot<TData> => (descriptor ? client.getSnapshot(descriptor) : disabledSnapshot),
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
      isLoading:
        snapshot.data === undefined &&
        (snapshot.status === "idle" || snapshot.status === "loading"),
      refresh,
      status: snapshot.status,
    }),
    [refresh, snapshot.data, snapshot.error, snapshot.status],
  );
}
