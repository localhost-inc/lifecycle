import type { SqlDriver } from "@lifecycle/db";
import {
  createDbServerUrl,
  DB_SERVER_TOKEN_HEADER,
  type DbServerExecuteRequest,
  type DbServerHealthResult,
  type DbServerRegistration,
  type DbServerResponse,
  type DbServerSelectRequest,
  type DbServerTransactionRequest,
} from "@lifecycle/db/server";
import { appDataDir, join } from "@tauri-apps/api/path";
import { invokeTauri } from "@/lib/tauri-error";

const DB_SERVER_PROCESS_ID = "db-server";

type DbServerClientRequest =
  | Omit<DbServerSelectRequest, "requestId">
  | Omit<DbServerExecuteRequest, "requestId">
  | Omit<DbServerTransactionRequest, "requestId">
  | { kind: "health" };

let cachedDbPath: string | null = null;
let cachedRegistration: DbServerRegistration | null = null;
let pendingConnection: Promise<DbServerRegistration> | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function retry<T>(task: () => Promise<T>, attempts: number, waitMs: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

async function resolveDbPath(): Promise<string> {
  if (cachedDbPath) {
    return cachedDbPath;
  }
  cachedDbPath = await join(await appDataDir(), "lifecycle.db");
  return cachedDbPath;
}

async function resolveDbServerDir(): Promise<string> {
  return join(await appDataDir(), "db-server");
}

async function resolveRegistrationPath(): Promise<string> {
  return join(await resolveDbServerDir(), "server.json");
}

async function resolveLogDir(): Promise<string> {
  return join(await resolveDbServerDir(), "logs");
}

async function killStaleServer(): Promise<void> {
  // First try killing via the process manager (current session).
  await invokeTauri("kill_managed_process", { id: DB_SERVER_PROCESS_ID });

  // Also kill by PID from the registration file (previous session).
  const existing = await readDbServerRegistration();
  if (existing && existing.pid > 0) {
    await invokeTauri("kill_process_by_pid", { pid: existing.pid });
    await sleep(100);
  }
}

async function startDbServer(): Promise<void> {
  await killStaleServer();

  const dbPath = await resolveDbPath();
  const registrationPath = await resolveRegistrationPath();
  const logDir = await resolveLogDir();

  await invokeTauri("spawn_managed_process", {
    request: {
      id: DB_SERVER_PROCESS_ID,
      args: [
        "db",
        "server",
        "--db-path",
        dbPath,
        "--registration-path",
        registrationPath,
        "--client-name",
        "lifecycle-desktop",
      ],
      cwd: null,
      env: {},
      logDir,
    },
  });
}

async function readDbServerRegistration(): Promise<DbServerRegistration | null> {
  const path = await resolveRegistrationPath();
  return invokeTauri<DbServerRegistration | null>("read_json_file", { path });
}

async function requestDbServer<TResult>(
  registration: DbServerRegistration,
  request: DbServerClientRequest,
): Promise<TResult> {
  const response = await fetch(createDbServerUrl(registration.port), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [DB_SERVER_TOKEN_HEADER]: registration.token,
    },
    body: JSON.stringify({
      ...request,
      requestId: crypto.randomUUID(),
    }),
  });

  const payload = (await response.json()) as DbServerResponse<TResult>;
  if (!payload.ok) {
    throw new Error(payload.error.message);
  }
  return payload.result;
}

async function isHealthy(registration: DbServerRegistration): Promise<boolean> {
  try {
    const result = await requestDbServer<DbServerHealthResult>(registration, {
      kind: "health",
    });
    return result.ok && result.dbPath === registration.dbPath;
  } catch {
    return false;
  }
}

async function connectToDbServer(forceStart: boolean): Promise<DbServerRegistration> {
  if (!forceStart && cachedRegistration && (await isHealthy(cachedRegistration))) {
    return cachedRegistration;
  }

  const existing = await readDbServerRegistration();
  if (!forceStart && existing && (await isHealthy(existing))) {
    cachedRegistration = existing;
    return existing;
  }

  await startDbServer();

  const registration = await retry(
    async () => {
      const next = await readDbServerRegistration();
      if (!next) {
        throw new Error("Lifecycle DB server has not registered yet.");
      }
      if (!(await isHealthy(next))) {
        throw new Error("Lifecycle DB server is not healthy yet.");
      }
      return next;
    },
    40,
    100,
  );

  cachedRegistration = registration;
  return registration;
}

async function ensureDbServer(): Promise<DbServerRegistration> {
  if (!pendingConnection) {
    pendingConnection = connectToDbServer(false).finally(() => {
      pendingConnection = null;
    });
  }
  return pendingConnection;
}

async function withDbServer<TResult>(request: DbServerClientRequest): Promise<TResult> {
  let registration = await ensureDbServer();
  try {
    return await requestDbServer<TResult>(registration, request);
  } catch (error) {
    cachedRegistration = null;
    registration = await connectToDbServer(true);
    return requestDbServer<TResult>(registration, request).catch((retryError) => {
      throw retryError instanceof Error ? retryError : error;
    });
  }
}

export const db: SqlDriver = {
  async select<T>(sql: string, params?: unknown[]): Promise<T[]> {
    return withDbServer<T[]>({
      kind: "select",
      sql,
      ...(params ? { params } : {}),
    });
  },
  async execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }> {
    return withDbServer<{ rowsAffected: number }>({
      kind: "execute",
      sql,
      ...(params ? { params } : {}),
    });
  },
  async transaction(statements) {
    return withDbServer({
      kind: "transaction",
      statements: [...statements],
    });
  },
};
