export interface SqlStatement {
  params?: unknown[];
  sql: string;
}

export interface SqlTransactionResult {
  rowsAffected: number[];
}

export interface SqlDriver {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
  transaction(statements: readonly SqlStatement[]): Promise<SqlTransactionResult>;
}
