import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolveCodexCliPath } from "./cli-path";

export interface CodexJsonRpcError {
  code?: number;
  data?: unknown;
  message?: string;
}

interface CodexJsonRpcResponse {
  error?: CodexJsonRpcError;
  id: number | string;
  result?: unknown;
}

export interface CodexAccountReadResult {
  account: null | {
    email?: string;
    planType?: string | null;
    type?: "apiKey" | "chatgpt";
  };
  requiresOpenaiAuth: boolean;
}

function createLineReader(onLine: (line: string) => void) {
  let buffer = "";

  return (chunk: Buffer | string) => {
    buffer += chunk.toString();

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        onLine(line);
      }
    }
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isCodexJsonRpcResponse(message: unknown): message is CodexJsonRpcResponse {
  return isRecord(message) && "id" in message && ("result" in message || "error" in message);
}

export class CodexAppServerClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private initialized = false;
  private nextRequestId = 1;
  private readonly notificationListeners = new Set<(method: string, params: unknown) => void>();
  private readonly pendingRequests = new Map<
    number | string,
    {
      reject: (error: Error) => void;
      resolve: (value: unknown) => void;
    }
  >();

  constructor() {
    this.child = spawn(
      process.execPath,
      [
        resolveCodexCliPath(),
        "app-server",
        "--listen",
        "stdio://",
        "--session-source",
        "lifecycle",
      ],
      {
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const readStdoutLine = createLineReader((line) => {
      const message = JSON.parse(line) as unknown;
      if (isCodexJsonRpcResponse(message)) {
        const response = message;
        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
          return;
        }
        this.pendingRequests.delete(response.id);
        if (response.error) {
          pending.reject(
            new Error(response.error.message ?? `Codex request ${String(response.id)} failed.`),
          );
          return;
        }
        pending.resolve(response.result);
        return;
      }

      if (isRecord(message) && typeof message.method === "string" && !("id" in message)) {
        for (const listener of this.notificationListeners) {
          listener(message.method, message.params);
        }
      }
    });

    this.child.stdout.on("data", readStdoutLine);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.request("initialize", {
      clientInfo: {
        name: "lifecycle",
        title: "Lifecycle",
        version: "0.0.0",
      },
    });
    this.notify("initialized");
    this.initialized = true;
  }

  onNotification(listener: (method: string, params: unknown) => void): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  onClose(listener: (code: number | null, signal: NodeJS.Signals | null) => void): void {
    this.child.on("close", listener);
  }

  onError(listener: (error: Error) => void): void {
    this.child.on("error", listener);
  }

  request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextRequestId++;
    const payload = {
      id,
      jsonrpc: "2.0" as const,
      method,
      ...(params === undefined ? {} : { params }),
    };
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { reject, resolve });
    });
  }

  notify(method: string, params?: unknown): void {
    const payload = {
      jsonrpc: "2.0" as const,
      method,
      ...(params === undefined ? {} : { params }),
    };
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  async close(): Promise<void> {
    this.child.stdin.end();
    this.child.kill();
  }
}
