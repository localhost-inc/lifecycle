import { connect, type Socket } from "node:net";
import { existsSync, readFileSync } from "node:fs";

import {
  encodeMessage,
  parseResponse,
  type SupervisorRequest,
  type SupervisorResponse,
  type SupervisorMessage,
} from "./protocol";
import { supervisorSocketPath, supervisorPidPath } from "./paths";

/**
 * Client for talking to the supervisor over the Unix domain socket.
 * Used by CLI commands and the TUI.
 */
export class SupervisorClient {
  private socket: Socket | null = null;
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
    }
  >();
  private nextId = 1;
  private buffer = "";
  private eventListener: ((msg: SupervisorMessage) => void) | null = null;

  async connect(): Promise<void> {
    const socketPath = supervisorSocketPath();

    return new Promise((resolve, reject) => {
      const socket = connect(socketPath, () => {
        this.socket = socket;
        resolve();
      });

      socket.on("error", (err) => {
        if (!this.socket) {
          reject(err);
        }
      });

      socket.on("data", (chunk) => {
        this.buffer += chunk.toString();
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const msg = parseResponse(line);
          if (!msg) continue;

          if ("id" in msg && typeof msg.id === "string") {
            const p = this.pending.get(msg.id);
            if (p) {
              this.pending.delete(msg.id);
              const resp = msg as SupervisorResponse;
              if (resp.error) {
                p.reject(new Error(resp.error.message));
              } else {
                p.resolve(resp.result);
              }
            }
          }

          // Forward events to listener
          if ("event" in msg) {
            this.eventListener?.(msg);
          }
        }
      });

      socket.on("close", () => {
        this.socket = null;
        for (const p of this.pending.values()) {
          p.reject(new Error("Connection closed"));
        }
        this.pending.clear();
      });
    });
  }

  onEvent(listener: (msg: SupervisorMessage) => void): void {
    this.eventListener = listener;
  }

  async request(
    method: string,
    workspace?: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.socket) {
      throw new Error("Not connected to supervisor");
    }

    const id = String(this.nextId++);
    const req: SupervisorRequest = {
      id,
      method,
      ...(workspace ? { workspace } : {}),
      ...(params ? { params } : {}),
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket!.write(encodeMessage(req));
    });
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
  }
}

/**
 * Check if the supervisor is running.
 */
export function isSupervisorRunning(): boolean {
  const pidPath = supervisorPidPath();
  if (!existsSync(pidPath)) return false;

  try {
    const pid = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);
    if (!Number.isFinite(pid)) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the supervisor socket exists and is connectable.
 */
export async function canConnectToSupervisor(): Promise<boolean> {
  const socketPath = supervisorSocketPath();
  if (!existsSync(socketPath)) return false;

  return new Promise((resolve) => {
    const socket = connect(socketPath, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
  });
}
