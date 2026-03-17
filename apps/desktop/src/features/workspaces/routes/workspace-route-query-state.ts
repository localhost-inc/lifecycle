import type { QueryResult } from "../../../query";

export function hasBlockingQueryLoad<T>(
  query: Pick<QueryResult<T>, "data" | "isLoading">,
): boolean {
  return query.isLoading && query.data === undefined;
}

export function hasBlockingQueryError<T>(query: Pick<QueryResult<T>, "data" | "error">): boolean {
  return query.error !== null && query.error !== undefined && query.data === undefined;
}
