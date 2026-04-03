import { createServer, type Server, type Socket } from "node:net";
import { mkdirSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import {
  METHODS,
  encodeMessage,
  parseRequest,
  type SupervisorRequest,
  type SupervisorResponse,
} from "./protocol";
import { supervisorSocketPath, supervisorPidPath } from "./paths";
import { WorkspaceManager } from "./workspace-manager";

export class SupervisorServer {
  private server: Server | null = null;
  private manager: WorkspaceManager;
  private connections = new Set<Socket>();

  constructor() {
    this.manager = new WorkspaceManager();
    this.manager.onEvent((workspace, event, data) => {
      this.broadcast({ event, workspace, data });
    });
  }

  async start(): Promise<void> {
    const socketPath = supervisorSocketPath();
    const pidPath = supervisorPidPath();

    // Ensure parent directory
    mkdirSync(dirname(socketPath), { recursive: true });

    // Clean up stale socket
    if (existsSync(socketPath)) {
      try {
        unlinkSync(socketPath);
      } catch {
        // May not exist
      }
    }

    // Write PID
    writeFileSync(pidPath, String(process.pid), "utf8");

    return new Promise((resolve, reject) => {
      this.server = createServer((socket) => this.handleConnection(socket));

      this.server.on("error", (err) => {
        reject(err);
      });

      this.server.listen(socketPath, () => {
        resolve();
      });
    });
  }

  stop(): void {
    this.manager.shutdown();

    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();

    this.server?.close();
    this.server = null;

    // Clean up files
    try {
      unlinkSync(supervisorSocketPath());
    } catch {}
    try {
      unlinkSync(supervisorPidPath());
    } catch {}
  }

  private handleConnection(socket: Socket): void {
    this.connections.add(socket);

    let buffer = "";

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const request = parseRequest(line);
        if (request) {
          this.handleRequest(request, socket);
        }
      }
    });

    socket.on("close", () => {
      this.connections.delete(socket);
    });

    socket.on("error", () => {
      this.connections.delete(socket);
    });
  }

  private async handleRequest(req: SupervisorRequest, socket: Socket): Promise<void> {
    try {
      const result = await this.dispatch(req);
      const response: SupervisorResponse = { id: req.id, result };
      socket.write(encodeMessage(response));
    } catch (err) {
      const response: SupervisorResponse = {
        id: req.id,
        error: {
          code: "internal_error",
          message: err instanceof Error ? err.message : String(err),
        },
      };
      socket.write(encodeMessage(response));
    }
  }

  private async dispatch(req: SupervisorRequest): Promise<unknown> {
    switch (req.method) {
      case METHODS.SUPERVISOR_STATUS:
        return { workspaces: this.manager.listWorkspaces() };

      case METHODS.SUPERVISOR_SHUTDOWN:
        // Graceful shutdown after responding
        setTimeout(() => process.exit(0), 100);
        return { ok: true };

      case METHODS.STACK_STATUS: {
        const workspace = requireWorkspace(req);
        return { services: this.manager.getServices(workspace) };
      }

      case METHODS.STACK_RUN: {
        const workspace = requireWorkspace(req);
        const serviceNames = (req.params?.services as string[] | undefined) ?? undefined;
        const started = await this.manager.startStack(workspace, serviceNames);
        return { started: started.map((s) => s.name) };
      }

      case METHODS.STACK_STOP: {
        const workspace = requireWorkspace(req);
        const serviceNames = (req.params?.services as string[] | undefined) ?? undefined;
        await this.manager.stopStack(workspace, serviceNames);
        return { ok: true };
      }

      default:
        throw new Error(`Unknown method: ${req.method}`);
    }
  }

  private broadcast(msg: { event: string; workspace?: string; data: unknown }): void {
    const encoded = encodeMessage(msg);
    for (const socket of this.connections) {
      socket.write(encoded);
    }
  }
}

function requireWorkspace(req: SupervisorRequest): string {
  if (!req.workspace) {
    throw new Error(`Method ${req.method} requires a workspace path`);
  }
  return req.workspace;
}
