import { readFileSync, watch, type FSWatcher } from "node:fs";
import { resolve } from "node:path";
import { parseManifest, type LifecycleConfig } from "@lifecycle/contracts";
import { type StartStackInput, type StartedService, declaredServiceNames } from "@lifecycle/stack";
import { LocalStackClient } from "@lifecycle/stack/internal/local";

import { hashWorkspacePath, workspaceLogDir } from "./paths";

export interface ServiceState {
  name: string;
  status: "stopped" | "starting" | "ready" | "failed";
  port: number | null;
  error: string | null;
}

export interface WorkspaceState {
  path: string;
  services: Map<string, ServiceState>;
  config: LifecycleConfig | null;
  configError: string | null;
}

type WorkspaceEventListener = (workspace: string, event: string, data: unknown) => void;

export class WorkspaceManager {
  private workspaces = new Map<string, WorkspaceState>();
  private watchers = new Map<string, FSWatcher>();
  private client: LocalStackClient;
  private listener: WorkspaceEventListener | null = null;

  constructor() {
    this.client = new LocalStackClient();
  }

  onEvent(listener: WorkspaceEventListener): void {
    this.listener = listener;
  }

  private emit(workspace: string, event: string, data: unknown): void {
    this.listener?.(workspace, event, data);
  }

  listWorkspaces(): Array<{ path: string; services: number; running: number }> {
    return [...this.workspaces.entries()].map(([path, state]) => ({
      path,
      services: state.services.size,
      running: [...state.services.values()].filter((s) => s.status === "ready").length,
    }));
  }

  getWorkspace(workspacePath: string): WorkspaceState | null {
    return this.workspaces.get(workspacePath) ?? null;
  }

  getServices(workspacePath: string): ServiceState[] {
    const state = this.workspaces.get(workspacePath);
    if (!state) return [];
    return [...state.services.values()];
  }

  async startStack(workspacePath: string, serviceNames?: string[]): Promise<StartedService[]> {
    let state = this.workspaces.get(workspacePath);

    // First time — register workspace
    if (!state) {
      state = {
        path: workspacePath,
        services: new Map(),
        config: null,
        configError: null,
      };
      this.workspaces.set(workspacePath, state);
    }

    // Read manifest
    const config = this.readManifest(workspacePath, state);
    if (!config) {
      throw new Error(state.configError ?? "Failed to read lifecycle.json");
    }

    // Populate service states
    const declared = declaredServiceNames(config);
    for (const name of declared) {
      if (!state.services.has(name)) {
        state.services.set(name, { name, status: "stopped", port: null, error: null });
      }
    }

    // Start watching manifest
    this.watchManifest(workspacePath);

    // Build start input
    const hash = hashWorkspacePath(workspacePath);
    const logDir = workspaceLogDir(hash);
    const hostLabel = workspacePath.split("/").pop() ?? "workspace";

    const services = declared.map((name) => ({
      id: `${workspacePath}:${name}`,
      workspace_id: workspacePath,
      name,
      status: "stopped" as const,
      status_reason: null,
      assigned_port: state!.services.get(name)?.port ?? null,
      preview_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const readyServiceNames = [...state.services.values()]
      .filter((s) => s.status === "ready")
      .map((s) => s.name);

    const input: StartStackInput = {
      stackId: workspacePath,
      hostLabel: slugify(hostLabel),
      name: slugify(hostLabel),
      prepared: false,
      readyServiceNames,
      rootPath: workspacePath,
      services,
      sourceRef: "local",
      ...(serviceNames ? { serviceNames } : {}),
      callbacks: {
        onServiceStarting: (name) => {
          const svc = state!.services.get(name);
          if (svc) {
            svc.status = "starting";
            this.emit(workspacePath, "service.status", { name, status: "starting" });
          }
        },
        onServiceReady: (started) => {
          const svc = state!.services.get(started.name);
          if (svc) {
            svc.status = "ready";
            svc.port = started.assignedPort;
            this.emit(workspacePath, "service.status", {
              name: started.name,
              status: "ready",
              port: started.assignedPort,
            });
          }
        },
        onServiceFailed: (name) => {
          const svc = state!.services.get(name);
          if (svc) {
            svc.status = "failed";
            this.emit(workspacePath, "service.status", { name, status: "failed" });
          }
        },
      },
    };

    const result = await this.client.start(config, input);
    return result.startedServices;
  }

  async stopStack(workspacePath: string, serviceNames?: string[]): Promise<void> {
    const state = this.workspaces.get(workspacePath);
    if (!state) return;

    const toStop = serviceNames ?? [...state.services.keys()];
    await this.client.stop(workspacePath, toStop);

    for (const name of toStop) {
      const svc = state.services.get(name);
      if (svc) {
        svc.status = "stopped";
        svc.port = null;
        this.emit(workspacePath, "service.status", { name, status: "stopped" });
      }
    }
  }

  shutdown(): void {
    // Stop all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    // Kill all managed processes
    this.client.getSupervisor().killAll();
  }

  private readManifest(workspacePath: string, state: WorkspaceState): LifecycleConfig | null {
    try {
      const manifestPath = resolve(workspacePath, "lifecycle.json");
      const text = readFileSync(manifestPath, "utf8");
      const parsed = parseManifest(text);
      if (!parsed.valid) {
        state.configError = `Invalid lifecycle.json: ${parsed.errors.map((e) => e.message).join(", ")}`;
        state.config = null;
        return null;
      }
      state.config = parsed.config;
      state.configError = null;
      return parsed.config;
    } catch (err) {
      state.configError = err instanceof Error ? err.message : String(err);
      state.config = null;
      return null;
    }
  }

  private watchManifest(workspacePath: string): void {
    if (this.watchers.has(workspacePath)) return;

    const manifestPath = resolve(workspacePath, "lifecycle.json");
    try {
      const watcher = watch(manifestPath, { persistent: false }, () => {
        this.onManifestChanged(workspacePath);
      });
      this.watchers.set(workspacePath, watcher);
    } catch {
      // File may not exist yet — that's fine
    }
  }

  private onManifestChanged(workspacePath: string): void {
    const state = this.workspaces.get(workspacePath);
    if (!state) return;

    const oldConfig = state.config;
    const newConfig = this.readManifest(workspacePath, state);
    if (!newConfig) return;

    const oldServices = new Set(oldConfig ? Object.keys(oldConfig.stack) : []);
    const newServices = new Set(Object.keys(newConfig.stack));

    // Detect removed services
    for (const name of oldServices) {
      if (!newServices.has(name)) {
        this.stopStack(workspacePath, [name]);
        state.services.delete(name);
      }
    }

    // Detect added services — register but don't auto-start
    for (const name of newServices) {
      if (!oldServices.has(name) && !state.services.has(name)) {
        state.services.set(name, { name, status: "stopped", port: null, error: null });
        this.emit(workspacePath, "service.status", { name, status: "stopped" });
      }
    }

    this.emit(workspacePath, "stack.reconciled", { path: workspacePath });
  }
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "unnamed"
  );
}
