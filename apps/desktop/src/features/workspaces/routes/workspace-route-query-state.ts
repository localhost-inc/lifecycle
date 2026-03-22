export function hasBlockingQueryLoad<T>(
  query: { data: T | undefined; isLoading: boolean },
): boolean {
  return query.isLoading && query.data === undefined;
}

export function hasBlockingQueryError<T>(
  query: { data: T | undefined; error: unknown },
): boolean {
  return query.error !== null && query.error !== undefined && query.data === undefined;
}
