import type { SqlStatement, SqlTransactionResult } from "./types";

export const DB_SERVER_TOKEN_HEADER = "x-lifecycle-db-token";

export type DbServerMode = "local" | "synced";

export interface DbServerRegistration {
  dbPath: string;
  mode: DbServerMode;
  pid: number;
  port: number;
  token: string;
  updatedAt: string;
}

export interface DbServerHealthResult {
  dbPath: string;
  mode: DbServerMode;
  ok: true;
}

export interface DbServerStatsResult {
  stats: unknown;
}

export interface DbServerSelectRequest {
  kind: "select";
  params?: unknown[];
  requestId: string;
  sql: string;
}

export interface DbServerExecuteRequest {
  kind: "execute";
  params?: unknown[];
  requestId: string;
  sql: string;
}

export interface DbServerTransactionRequest {
  kind: "transaction";
  requestId: string;
  statements: SqlStatement[];
}

export interface DbServerHealthRequest {
  kind: "health";
  requestId: string;
}

export interface DbServerPullRequest {
  kind: "pull";
  requestId: string;
}

export interface DbServerPushRequest {
  kind: "push";
  requestId: string;
}

export interface DbServerStatsRequest {
  kind: "stats";
  requestId: string;
}

export type DbServerRequest =
  | DbServerSelectRequest
  | DbServerExecuteRequest
  | DbServerTransactionRequest
  | DbServerHealthRequest
  | DbServerPullRequest
  | DbServerPushRequest
  | DbServerStatsRequest;

export type DbServerTransactionResult = SqlTransactionResult;

export interface DbServerSuccessResponse<TResult> {
  ok: true;
  requestId: string;
  result: TResult;
}

export interface DbServerErrorResponse {
  error: {
    code: string;
    message: string;
  };
  ok: false;
  requestId: string;
}

export type DbServerResponse<TResult = unknown> =
  | DbServerSuccessResponse<TResult>
  | DbServerErrorResponse;

export function createDbServerUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}
