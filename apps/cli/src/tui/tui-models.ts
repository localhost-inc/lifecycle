import type { WorkspaceRecord } from "@lifecycle/contracts";

import type { BridgeRepositorySummary } from "./opentui-helpers";

export interface RepositoriesResponse {
  repositories: BridgeRepositorySummary[];
}

export interface WorkspaceStackNode {
  assigned_port?: number | null;
  kind: "image" | "process" | "task";
  name: string;
  preview_url?: string | null;
  status?: string;
  status_reason?: string | null;
}

export interface WorkspaceDetailResponse {
  stack: {
    errors: string[];
    nodes: WorkspaceStackNode[];
    state: string;
    workspace_id: string;
  };
  workspace: WorkspaceRecord;
}

export interface WorkspaceScope {
  binding: "adhoc" | "bound";
  cwd: string | null;
  host: "cloud" | "docker" | "local" | "remote" | "unknown";
  repo_name: string | null;
  resolution_error: string | null;
  resolution_note: string | null;
  source_ref: string | null;
  status: string | null;
  workspace_id: string | null;
  workspace_name: string;
  workspace_root: string | null;
}

export interface WorkspaceShellLaunchSpec {
  args: string[];
  cwd: string | null;
  env: Array<[string, string]>;
  program: string;
}

export interface WorkspaceShellEnvelope {
  shell: {
    backend_label: string;
    launch_error: string | null;
    persistent: boolean;
    prepare: WorkspaceShellLaunchSpec | null;
    session_name: string | null;
    spec: WorkspaceShellLaunchSpec | null;
  };
  workspace: WorkspaceScope;
}

export interface WorkspaceTerminalRuntime {
  backend_label: string;
  launch_error: string | null;
  persistent: boolean;
  runtime_id: string | null;
  supports_close: boolean;
  supports_connect: boolean;
  supports_create: boolean;
  supports_rename: boolean;
}

export interface WorkspaceTerminalRecord {
  busy: boolean;
  id: string;
  kind: string;
  title: string;
}

export interface WorkspaceTerminalsEnvelope {
  runtime: WorkspaceTerminalRuntime;
  terminals: WorkspaceTerminalRecord[];
  workspace: WorkspaceScope;
}

export interface WorkspaceCreatedTerminalEnvelope {
  runtime: WorkspaceTerminalRuntime;
  terminal: WorkspaceTerminalRecord;
  workspace: WorkspaceScope;
}

export interface WorkspaceSpawnTerminalTransport {
  kind: "spawn";
  prepare?: WorkspaceShellLaunchSpec | null;
  spec?: WorkspaceShellLaunchSpec | null;
}

export interface WorkspaceStreamTerminalTransport {
  kind: "stream";
  protocol: string;
  streamId: string;
  token: string;
  websocketPath: string;
}

export interface WorkspaceTerminalConnectionEnvelope {
  connection: {
    connection_id: string;
    initial_ansi: string | null;
    launch_error: string | null;
    terminal_id: string;
    transport?: WorkspaceSpawnTerminalTransport | WorkspaceStreamTerminalTransport | null;
  };
  runtime: WorkspaceTerminalRuntime;
  workspace: WorkspaceScope;
}

export type FocusTarget = "canvas" | "extensions" | "sidebar";

export type WorkspaceExtensionKind = "debug" | "stack";
